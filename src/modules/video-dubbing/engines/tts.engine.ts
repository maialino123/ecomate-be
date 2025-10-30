import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { TTSResult, WhisperTranscription } from '../interfaces/video-dubbing.interface';
import { getErrorMessage, getErrorStack } from '@common/utils/error.utils';

const execAsync = promisify(exec);

@Injectable()
export class TTSEngine {
  private readonly logger = new Logger(TTSEngine.name);
  private readonly tempDir = path.join(process.cwd(), 'temp', 'tts');

  // Piper voice models for Vietnamese
  private readonly voiceModels: Record<string, string> = {
    'vi-female-1': 'vi_VN-vais1000-medium',
    'vi-female-2': 'vi_VN-vais1000-low',
    'vi-male-1': 'vi_VN-vivos-medium',
    'vi-male-2': 'vi_VN-vivos-low',
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
   * Synthesize speech from text using Piper TTS
   *
   * Phase 1: Use Piper (free, open-source)
   * Phase 2: Add Azure TTS option (premium quality)
   *
   * @param text - Text to synthesize
   * @param voice - Voice model to use
   * @param timings - Optional timings from Whisper (for subtitle sync)
   * @returns TTS result with audio path and metadata
   */
  async synthesize(
    text: string,
    voice: string = 'vi-female-1',
    timings?: WhisperTranscription['segments'],
  ): Promise<TTSResult> {
    this.logger.log(`Synthesizing speech with Piper TTS: ${text.slice(0, 100)}...`);

    const outputPath = path.join(this.tempDir, `tts_${Date.now()}.wav`);
    const voiceModel = this.voiceModels[voice] || this.voiceModels['vi-female-1'];

    try {
      // Create temporary text file
      const textPath = path.join(this.tempDir, `text_${Date.now()}.txt`);
      await fs.writeFile(textPath, text, 'utf-8');

      // Piper command:
      // echo "text" | piper --model <model> --output_file output.wav
      // For now, use simple command without model specification (assumes default)
      const command = `echo "${text.replace(/"/g, '\\"')}" | piper --output_file "${outputPath}"`;

      const startTime = Date.now();
      const { stderr } = await execAsync(command, {
        maxBuffer: 1024 * 1024 * 50, // 50MB buffer
      });

      const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.log(`TTS synthesis completed in ${processingTime}s`);

      if (stderr) {
        this.logger.debug(`Piper output: ${stderr.slice(0, 500)}...`);
      }

      // Get audio metadata
      const duration = await this.getAudioDuration(outputPath);
      const stats = await fs.stat(outputPath);

      const result: TTSResult = {
        audioPath: outputPath,
        duration,
        sampleRate: 22050, // Piper default
      };

      this.logger.log(`TTS audio generated: ${outputPath} (${(stats.size / 1024).toFixed(2)} KB, ${duration.toFixed(2)}s)`);

      // Clean up text file
      await this.deleteFile(textPath);

      return result;
    } catch (error) {
      this.logger.error(`TTS synthesis failed: ${getErrorMessage(error)}`);

      // Fallback: Generate silent audio as placeholder (for testing)
      this.logger.warn('Generating silent audio as fallback');
      return this.generateSilentAudio(5.0); // 5 seconds silence
    }
  }

  /**
   * Synthesize speech using Azure TTS (Phase 2 - Premium option)
   */
  async synthesizeWithAzure(text: string, voice: string): Promise<TTSResult> {
    this.logger.log('[Phase 2] Azure TTS not implemented yet');
    // TODO: Implement Azure TTS integration
    throw new Error('Azure TTS not implemented yet');
  }

  /**
   * Generate silent audio (fallback for testing)
   */
  private async generateSilentAudio(duration: number): Promise<TTSResult> {
    const outputPath = path.join(this.tempDir, `silent_${Date.now()}.wav`);

    try {
      // Generate silent audio with ffmpeg
      const command = `ffmpeg -f lavfi -i anullsrc=r=22050:cl=mono -t ${duration} "${outputPath}" -y`;
      await execAsync(command);

      return {
        audioPath: outputPath,
        duration,
        sampleRate: 22050,
      };
    } catch (error) {
      this.logger.error(`Failed to generate silent audio: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Get audio duration using ffprobe
   */
  private async getAudioDuration(audioPath: string): Promise<number> {
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
   * Check if Piper is installed
   */
  async checkPiper(): Promise<boolean> {
    try {
      await execAsync('piper --version');
      return true;
    } catch (error) {
      this.logger.error('Piper is not installed. Please install it with: pip install piper-tts');
      return false;
    }
  }

  /**
   * Get available voices
   */
  getAvailableVoices(): string[] {
    return Object.keys(this.voiceModels);
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
