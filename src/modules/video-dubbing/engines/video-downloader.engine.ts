import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { VideoDownloadResult } from '../interfaces/video-dubbing.interface';
import { getErrorMessage } from '@common/utils/error.utils';

const execAsync = promisify(exec);

@Injectable()
export class VideoDownloaderEngine {
  private readonly logger = new Logger(VideoDownloaderEngine.name);
  private readonly tempDir = path.join(process.cwd(), 'temp', 'videos');

  constructor() {
    // Ensure temp directory exists
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
   * Download video from 1688 using yt-dlp
   * yt-dlp is a youtube-dl fork that supports many video platforms including 1688
   *
   * @param videoUrl - 1688 video URL
   * @param outputFilename - Output filename (without extension)
   * @returns Video download result with file path and metadata
   */
  async download(videoUrl: string, outputFilename: string): Promise<VideoDownloadResult> {
    this.logger.log(`Downloading video from: ${videoUrl}`);

    const outputPath = path.join(this.tempDir, `${outputFilename}.mp4`);

    try {
      // yt-dlp command with options:
      // -f 'best[ext=mp4]' - Download best quality mp4
      // --no-playlist - Don't download playlists
      // --no-warnings - Suppress warnings
      // -o - Output template
      // --print-json - Output video info as JSON
      const command = `yt-dlp -f 'best[ext=mp4]' --no-playlist --no-warnings -o "${outputPath}" --print-json "${videoUrl}"`;

      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 1024 * 1024 * 50, // 50MB buffer
      });

      if (stderr && !stderr.includes('WARNING')) {
        this.logger.warn(`yt-dlp stderr: ${stderr}`);
      }

      // Parse video info from JSON output
      let videoInfo: any = {};
      try {
        videoInfo = JSON.parse(stdout);
      } catch (e) {
        this.logger.warn('Failed to parse yt-dlp JSON output');
      }

      // Get file stats
      const stats = await fs.stat(outputPath);

      const result: VideoDownloadResult = {
        filePath: outputPath,
        format: videoInfo.ext || 'mp4',
        resolution: videoInfo.resolution || 'unknown',
        duration: videoInfo.duration || 0,
        size: stats.size,
      };

      this.logger.log(`Video downloaded successfully: ${outputPath} (${(result.size / 1024 / 1024).toFixed(2)} MB)`);

      return result;
    } catch (error) {
      this.logger.error(`Failed to download video: ${getErrorMessage(error)}`);

      // If yt-dlp fails, try fallback with playwright (Phase 2)
      // For now, throw error
      throw new Error(`Video download failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Check if yt-dlp is installed
   */
  async checkYtDlp(): Promise<boolean> {
    try {
      await execAsync('yt-dlp --version');
      return true;
    } catch (error) {
      this.logger.error('yt-dlp is not installed. Please install it with: pip install yt-dlp');
      return false;
    }
  }

  /**
   * Delete video file
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      this.logger.log(`Deleted video file: ${filePath}`);
    } catch (error) {
      this.logger.warn(`Failed to delete file ${filePath}: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Get video info without downloading
   */
  async getVideoInfo(videoUrl: string): Promise<any> {
    try {
      const command = `yt-dlp --dump-json --no-warnings "${videoUrl}"`;
      const { stdout } = await execAsync(command);
      return JSON.parse(stdout);
    } catch (error) {
      this.logger.error(`Failed to get video info: ${getErrorMessage(error)}`);
      throw new Error(`Failed to get video info: ${getErrorMessage(error)}`);
    }
  }
}
