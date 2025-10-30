import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  VideoEncodingResult,
  HLSTranscodingResult,
} from '../interfaces/video-dubbing.interface';
import { getErrorMessage } from '@common/utils/error.utils';

const execAsync = promisify(exec);

@Injectable()
export class VideoEncoderEngine {
  private readonly logger = new Logger(VideoEncoderEngine.name);
  private readonly tempDir = path.join(process.cwd(), 'temp', 'encoded');

  // Video quality presets
  private readonly qualityPresets: Record<string, { resolution: string; bitrate: string }> = {
    '480p': { resolution: '854x480', bitrate: '1000k' },
    '720p': { resolution: '1280x720', bitrate: '2500k' },
    '1080p': { resolution: '1920x1080', bitrate: '5000k' },
  };

  constructor() {
    this.ensureTempDir();
  }

  private async ensureTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      this.logger.error(`Failed to create temp directory: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Replace audio in video and optionally re-encode to target quality
   *
   * @param videoPath - Path to original video
   * @param audioPath - Path to dubbed audio
   * @param quality - Target quality (480p, 720p, 1080p)
   * @returns Encoding result
   */
  async replaceAudio(
    videoPath: string,
    audioPath: string,
    quality: string = '720p',
  ): Promise<VideoEncodingResult> {
    this.logger.log(`Encoding video with new audio: ${videoPath}, quality: ${quality}`);

    const outputPath = path.join(this.tempDir, `dubbed_${Date.now()}.mp4`);
    const preset = this.qualityPresets[quality] || this.qualityPresets['720p'];

    try {
      // ffmpeg command:
      // -i video.mp4 - Video input
      // -i audio.wav - Audio input
      // -c:v libx264 - H.264 video codec
      // -preset medium - Encoding speed/quality tradeoff
      // -crf 23 - Quality (0-51, lower = better, 23 = good default)
      // -vf scale=<resolution> - Scale video
      // -c:a aac - AAC audio codec
      // -b:a 192k - Audio bitrate
      // -map 0:v:0 - Use video from first input
      // -map 1:a:0 - Use audio from second input
      // -shortest - Match shortest stream
      const command = `ffmpeg -i "${videoPath}" -i "${audioPath}" \
        -c:v libx264 -preset medium -crf 23 -vf "scale=${preset.resolution}:force_original_aspect_ratio=decrease,pad=${preset.resolution}:(ow-iw)/2:(oh-ih)/2" \
        -b:v ${preset.bitrate} \
        -c:a aac -b:a 192k \
        -map 0:v:0 -map 1:a:0 -shortest \
        "${outputPath}" -y`;

      const startTime = Date.now();
      const { stderr } = await execAsync(command, {
        maxBuffer: 1024 * 1024 * 100, // 100MB buffer
      });

      const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.log(`Video encoding completed in ${processingTime}s`);

      if (stderr) {
        this.logger.debug(`ffmpeg encoding output: ${stderr.slice(0, 500)}...`);
      }

      // Get video metadata
      const duration = await this.getVideoDuration(outputPath);
      const stats = await fs.stat(outputPath);

      const result: VideoEncodingResult = {
        videoPath: outputPath,
        format: 'mp4',
        resolution: quality,
        duration,
        size: stats.size,
      };

      this.logger.log(`Video encoded successfully: ${outputPath} (${(result.size / 1024 / 1024).toFixed(2)} MB)`);

      return result;
    } catch (error) {
      this.logger.error(`Video encoding failed: ${getErrorMessage(error)}`);
      throw new Error(`Video encoding failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Generate HLS playlist and segments (Phase 2)
   *
   * @param videoPath - Path to video file
   * @returns HLS transcoding result
   */
  async generateHLS(videoPath: string): Promise<HLSTranscodingResult> {
    this.logger.log(`Generating HLS playlist: ${videoPath}`);

    const outputDir = path.join(this.tempDir, `hls_${Date.now()}`);
    await fs.mkdir(outputDir, { recursive: true });

    const playlistPath = path.join(outputDir, 'playlist.m3u8');
    const segmentPattern = path.join(outputDir, 'segment_%03d.ts');

    try {
      // ffmpeg HLS command:
      // -i video.mp4 - Input
      // -c:v libx264 - Video codec
      // -c:a aac - Audio codec
      // -hls_time 10 - Segment duration (10 seconds)
      // -hls_list_size 0 - Include all segments in playlist
      // -hls_segment_filename - Segment filename pattern
      // -f hls - HLS format
      const command = `ffmpeg -i "${videoPath}" \
        -c:v libx264 -c:a aac \
        -hls_time 10 \
        -hls_list_size 0 \
        -hls_segment_filename "${segmentPattern}" \
        -f hls "${playlistPath}" -y`;

      const startTime = Date.now();
      const { stderr } = await execAsync(command, {
        maxBuffer: 1024 * 1024 * 100,
      });

      const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.log(`HLS generation completed in ${processingTime}s`);

      if (stderr) {
        this.logger.debug(`ffmpeg HLS output: ${stderr.slice(0, 500)}...`);
      }

      // Get segment files
      const files = await fs.readdir(outputDir);
      const segmentFiles = files
        .filter((f) => f.endsWith('.ts'))
        .map((f) => path.join(outputDir, f));

      // Calculate total size
      let totalSize = 0;
      for (const file of segmentFiles) {
        const stats = await fs.stat(file);
        totalSize += stats.size;
      }

      const duration = await this.getVideoDuration(videoPath);

      const result: HLSTranscodingResult = {
        playlistPath,
        segmentPaths: segmentFiles,
        duration,
        totalSize,
      };

      this.logger.log(`HLS generated: ${segmentFiles.length} segments, ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

      return result;
    } catch (error) {
      this.logger.error(`HLS generation failed: ${getErrorMessage(error)}`);
      throw new Error(`HLS generation failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Get video duration
   */
  async getVideoDuration(videoPath: string): Promise<number> {
    try {
      const command = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
      const { stdout } = await execAsync(command);
      return parseFloat(stdout.trim());
    } catch (error) {
      this.logger.error(`Failed to get video duration: ${getErrorMessage(error)}`);
      return 0;
    }
  }

  /**
   * Generate video thumbnail
   */
  async generateThumbnail(videoPath: string, timestamp: number = 1): Promise<string> {
    const outputPath = path.join(this.tempDir, `thumb_${Date.now()}.jpg`);

    try {
      // Extract frame at timestamp
      const command = `ffmpeg -i "${videoPath}" -ss ${timestamp} -vframes 1 -q:v 2 "${outputPath}" -y`;
      await execAsync(command);

      this.logger.log(`Thumbnail generated: ${outputPath}`);
      return outputPath;
    } catch (error) {
      this.logger.error(`Failed to generate thumbnail: ${getErrorMessage(error)}`);
      throw new Error(`Thumbnail generation failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Check if ffmpeg is installed
   */
  async checkFFmpeg(): Promise<boolean> {
    try {
      await execAsync('ffmpeg -version');
      return true;
    } catch (error) {
      this.logger.error('ffmpeg is not installed');
      return false;
    }
  }

  /**
   * Delete file
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      this.logger.log(`Deleted file: ${filePath}`);
    } catch (error) {
      this.logger.warn(`Failed to delete file ${filePath}: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Delete directory recursively
   */
  async deleteDirectory(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
      this.logger.log(`Deleted directory: ${dirPath}`);
    } catch (error) {
      this.logger.warn(`Failed to delete directory ${dirPath}: ${getErrorMessage(error)}`);
    }
  }
}
