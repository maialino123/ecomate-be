import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { WhisperTranscription } from '../interfaces/video-dubbing.interface';
import { getErrorMessage } from '@common/utils/error.utils';

const execAsync = promisify(exec);

@Injectable()
export class WhisperEngine {
  private readonly logger = new Logger(WhisperEngine.name);
  private readonly tempDir = path.join(process.cwd(), 'temp', 'whisper');

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
   * Transcribe audio using Whisper ASR
   *
   * Phase 1: Use Whisper tiny model (fast, lower accuracy)
   * Phase 2: Upgrade to medium/large model (slower, higher accuracy)
   *
   * @param audioPath - Path to audio file
   * @param language - Source language code (zh for Chinese)
   * @returns Transcription result with text and segments
   */
  async transcribe(audioPath: string, language: string = 'zh'): Promise<WhisperTranscription> {
    this.logger.log(`Transcribing audio with Whisper: ${audioPath}`);

    try {
      // Whisper command:
      // --model tiny - Use tiny model (Phase 1 MVP)
      // --language zh - Set language to Chinese
      // --output_format json - Output JSON format
      // --output_dir - Output directory
      const outputDir = this.tempDir;
      const outputName = path.basename(audioPath, path.extname(audioPath));

      const command = `whisper "${audioPath}" --model tiny --language ${language} --output_format json --output_dir "${outputDir}"`;

      const startTime = Date.now();
      const { stderr } = await execAsync(command, {
        maxBuffer: 1024 * 1024 * 50, // 50MB buffer
      });

      const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.log(`Whisper transcription completed in ${processingTime}s`);

      if (stderr) {
        this.logger.debug(`Whisper output: ${stderr.slice(0, 500)}...`);
      }

      // Read JSON output
      const jsonPath = path.join(outputDir, `${outputName}.json`);
      const jsonContent = await fs.readFile(jsonPath, 'utf-8');
      const whisperOutput = JSON.parse(jsonContent);

      // Map Whisper output to our interface
      const result: WhisperTranscription = {
        text: whisperOutput.text || '',
        language: whisperOutput.language || language,
        duration: whisperOutput.duration || 0,
        segments: whisperOutput.segments
          ? whisperOutput.segments.map((seg: any) => ({
              id: seg.id,
              start: seg.start,
              end: seg.end,
              text: seg.text.trim(),
            }))
          : [],
      };

      this.logger.log(`Transcription: ${result.text.slice(0, 100)}...`);
      this.logger.log(`Segments: ${result.segments.length}`);

      // Clean up JSON file
      await this.deleteFile(jsonPath);

      return result;
    } catch (error) {
      this.logger.error(`Whisper transcription failed: ${getErrorMessage(error)}`);
      throw new Error(`Whisper transcription failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Check if Whisper is installed
   */
  async checkWhisper(): Promise<boolean> {
    try {
      await execAsync('whisper --help');
      return true;
    } catch (error) {
      this.logger.error('Whisper is not installed. Please install it with: pip install openai-whisper');
      return false;
    }
  }

  /**
   * Get available Whisper models
   */
  getAvailableModels(): string[] {
    return ['tiny', 'base', 'small', 'medium', 'large'];
  }

  /**
   * Delete file
   */
  private async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      this.logger.debug(`Deleted file: ${filePath}`);
    } catch (error) {
      this.logger.warn(`Failed to delete file ${filePath}: ${getErrorMessage(error)}`);
    }
  }
}
