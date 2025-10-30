import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  AudioExtractionResult,
  AudioSeparationResult,
} from '../interfaces/video-dubbing.interface';
import { getErrorMessage, getErrorStack } from '@common/utils/error.utils';

const execAsync = promisify(exec);

@Injectable()
export class AudioProcessorEngine {
  private readonly logger = new Logger(AudioProcessorEngine.name);
  private readonly tempDir = path.join(process.cwd(), 'temp', 'audio');

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
   * Extract audio from video file using ffmpeg
   *
   * @param videoPath - Path to video file
   * @param outputFilename - Output audio filename (without extension)
   * @returns Audio extraction result
   */
  async extractAudio(videoPath: string, outputFilename: string): Promise<AudioExtractionResult> {
    this.logger.log(`Extracting audio from video: ${videoPath}`);

    const outputPath = path.join(this.tempDir, `${outputFilename}.wav`);

    try {
      // ffmpeg command to extract audio:
      // -i input.mp4 - Input file
      // -vn - No video
      // -acodec pcm_s16le - PCM 16-bit codec (WAV)
      // -ar 16000 - Sample rate 16kHz (optimal for Whisper)
      // -ac 1 - Mono audio (Whisper works better with mono)
      const command = `ffmpeg -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${outputPath}" -y`;

      const { stderr } = await execAsync(command, {
        maxBuffer: 1024 * 1024 * 50, // 50MB buffer
      });

      // ffmpeg outputs to stderr by default (not an error)
      if (stderr) {
        this.logger.debug(`ffmpeg output: ${stderr.slice(0, 500)}...`);
      }

      // Parse duration from ffmpeg output
      const durationMatch = stderr.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      let duration = 0;
      if (durationMatch) {
        const [, hours, minutes, seconds] = durationMatch;
        duration = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
      }

      const stats = await fs.stat(outputPath);

      const result: AudioExtractionResult = {
        audioPath: outputPath,
        duration,
        sampleRate: 16000,
        channels: 1,
      };

      this.logger.log(`Audio extracted successfully: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

      return result;
    } catch (error) {
      this.logger.error(`Failed to extract audio: ${getErrorMessage(error)}`);
      throw new Error(`Audio extraction failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Separate audio into voice and music using Demucs (Phase 2)
   * For Phase 1 MVP, this is a placeholder
   */
  async separateAudio(audioPath: string, outputPrefix: string): Promise<AudioSeparationResult> {
    this.logger.log('[Phase 2] Audio separation with Demucs not implemented yet');

    // For Phase 1, return the original audio as voice and no music
    return {
      voicePath: audioPath,
      musicPath: null,
      duration: 0,
    };
  }

  /**
   * Mix voiceover with background music
   *
   * @param voiceoverPath - Path to voiceover audio
   * @param musicPath - Path to background music (optional)
   * @param options - Mixing options
   * @returns Path to mixed audio file
   */
  async mixAudio(
    voiceoverPath: string,
    musicPath: string | null,
    options: { duckingLevel?: number } = {},
  ): Promise<string> {
    this.logger.log(`Mixing audio: voiceover=${voiceoverPath}, music=${musicPath}`);

    const outputPath = path.join(this.tempDir, `mixed_${Date.now()}.wav`);

    try {
      let command: string;

      if (musicPath) {
        // Mix voiceover with background music with ducking
        // Ducking: Lower music volume when voice is present
        const duckingLevel = options.duckingLevel || -6; // -6dB by default

        command = `ffmpeg -i "${voiceoverPath}" -i "${musicPath}" -filter_complex "[1:a]volume=${duckingLevel}dB[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=2" "${outputPath}" -y`;
      } else {
        // No music, just copy voiceover
        command = `ffmpeg -i "${voiceoverPath}" -c copy "${outputPath}" -y`;
      }

      const { stderr } = await execAsync(command, {
        maxBuffer: 1024 * 1024 * 50,
      });

      if (stderr) {
        this.logger.debug(`ffmpeg mix output: ${stderr.slice(0, 500)}...`);
      }

      this.logger.log(`Audio mixed successfully: ${outputPath}`);

      return outputPath;
    } catch (error) {
      this.logger.error(`Failed to mix audio: ${getErrorMessage(error)}`);
      throw new Error(`Audio mixing failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Replace audio in video file
   *
   * @param videoPath - Path to video file
   * @param audioPath - Path to new audio file
   * @param outputFilename - Output video filename
   * @returns Path to output video
   */
  async replaceAudioInVideo(
    videoPath: string,
    audioPath: string,
    outputFilename: string,
  ): Promise<string> {
    this.logger.log(`Replacing audio in video: ${videoPath}`);

    const outputPath = path.join(path.dirname(videoPath), `${outputFilename}.mp4`);

    try {
      // ffmpeg command to replace audio:
      // -i video.mp4 - Video input
      // -i audio.wav - Audio input
      // -c:v copy - Copy video codec (no re-encoding)
      // -c:a aac - Encode audio to AAC
      // -map 0:v:0 - Use video from first input
      // -map 1:a:0 - Use audio from second input
      // -shortest - Match shortest stream duration
      const command = `ffmpeg -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -b:a 192k -map 0:v:0 -map 1:a:0 -shortest "${outputPath}" -y`;

      const { stderr } = await execAsync(command, {
        maxBuffer: 1024 * 1024 * 100, // 100MB buffer for video
      });

      if (stderr) {
        this.logger.debug(`ffmpeg replace audio output: ${stderr.slice(0, 500)}...`);
      }

      this.logger.log(`Audio replaced successfully: ${outputPath}`);

      return outputPath;
    } catch (error) {
      this.logger.error(`Failed to replace audio: ${getErrorMessage(error)}`);
      throw new Error(`Audio replacement failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Get audio duration
   */
  async getAudioDuration(audioPath: string): Promise<number> {
    try {
      const command = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`;
      const { stdout } = await execAsync(command);
      return parseFloat(stdout.trim());
    } catch (error) {
      this.logger.error(`Failed to get audio duration: ${getErrorMessage(error)}`);
      return 0;
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
      this.logger.error('ffmpeg is not installed. Please install ffmpeg');
      return false;
    }
  }

  /**
   * Delete audio file
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      this.logger.log(`Deleted audio file: ${filePath}`);
    } catch (error) {
      this.logger.warn(`Failed to delete file ${filePath}: ${getErrorMessage(error)}`);
    }
  }
}
