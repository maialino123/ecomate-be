/**
 * Video dubbing module interfaces
 */

import { JobStatus, VideoStatus } from '@prisma/client';

export interface VideoProcessingOptions {
  keepBGM?: boolean;
  ttsVoice?: string;
  quality?: string;
  generateSubtitles?: boolean;
  generateHLS?: boolean;
  targetLang?: string;
}

export interface VideoDubbingJobData {
  jobId: string;
  product1688Id: string;
  originalVideoUrl: string;
  options: VideoProcessingOptions;
}

export interface VideoMeta {
  duration: number; // seconds
  resolution: string; // e.g., "1920x1080"
  size: number; // bytes
  format: string; // e.g., "mp4", "m3u8"
  codec?: string; // e.g., "h264"
  bitrate?: number; // bps
}

export interface AudioMeta {
  transcription: string; // Original Chinese text
  translation: string; // Translated Vietnamese text
  ttsConfig: {
    voice: string;
    speed: number;
    pitch: number;
  };
  timings?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

export interface WhisperTranscription {
  text: string;
  language: string;
  duration: number;
  segments: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
  }>;
}

export interface VideoDownloadResult {
  filePath: string;
  format: string;
  resolution: string;
  duration: number;
  size: number;
}

export interface AudioExtractionResult {
  audioPath: string;
  duration: number;
  sampleRate: number;
  channels: number;
}

export interface AudioSeparationResult {
  voicePath: string;
  musicPath: string | null; // null when no separation
  duration: number;
}

export interface TTSResult {
  audioPath: string;
  duration: number;
  sampleRate: number;
}

export interface VideoEncodingResult {
  videoPath: string;
  format: string;
  resolution: string;
  duration: number;
  size: number;
}

export interface HLSTranscodingResult {
  playlistPath: string;
  segmentPaths: string[];
  duration: number;
  totalSize: number;
}

export interface VideoDubbingJobStatus {
  jobId: string;
  product1688Id: string;
  status: JobStatus;
  progress: number;
  currentStep: string;
  queuedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  dubbedVideoUrl?: string;
  hlsPlaylistUrl?: string;
  subtitlesUrl?: string;
  errorMessage?: string;
  retryCount: number;
}

export interface Product1688VideoInfo {
  id: string;
  originalVideoUrl?: string;
  dubbedVideoUrl?: string;
  hlsPlaylistUrl?: string;
  thumbnailUrl?: string;
  videoStatus?: VideoStatus;
  videoProcessedAt?: Date;
  videoMeta?: VideoMeta;
}
