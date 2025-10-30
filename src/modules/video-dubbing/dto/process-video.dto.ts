import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum VideoQuality {
  LOW = '480p',
  MEDIUM = '720p',
  HIGH = '1080p',
}

export enum TTSVoice {
  VI_FEMALE_1 = 'vi-female-1',
  VI_FEMALE_2 = 'vi-female-2',
  VI_MALE_1 = 'vi-male-1',
  VI_MALE_2 = 'vi-male-2',
}

export class VideoProcessingOptionsDto {
  @ApiPropertyOptional({
    description: 'Keep background music (Phase 2 - Demucs)',
    example: true,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  keepBGM?: boolean;

  @ApiPropertyOptional({
    description: 'TTS voice selection',
    enum: TTSVoice,
    example: TTSVoice.VI_FEMALE_1,
    default: TTSVoice.VI_FEMALE_1,
  })
  @IsEnum(TTSVoice)
  @IsOptional()
  ttsVoice?: TTSVoice;

  @ApiPropertyOptional({
    description: 'Video quality',
    enum: VideoQuality,
    example: VideoQuality.MEDIUM,
    default: VideoQuality.MEDIUM,
  })
  @IsEnum(VideoQuality)
  @IsOptional()
  quality?: VideoQuality;

  @ApiPropertyOptional({
    description: 'Generate subtitles (Phase 2)',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  generateSubtitles?: boolean;

  @ApiPropertyOptional({
    description: 'Generate HLS playlist (Phase 2)',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  generateHLS?: boolean;

  @ApiPropertyOptional({
    description: 'Target language',
    example: 'vi',
    default: 'vi',
  })
  @IsString()
  @IsOptional()
  targetLang?: string;
}

export class ProcessVideoDto {
  @ApiPropertyOptional({
    description: 'Video processing options',
    type: VideoProcessingOptionsDto,
  })
  @ValidateNested()
  @Type(() => VideoProcessingOptionsDto)
  @IsOptional()
  options?: VideoProcessingOptionsDto;
}

export class ProcessVideoResponseDto {
  @ApiProperty({
    description: 'Job ID',
    example: 'cm123abc456',
  })
  jobId!: string;

  @ApiProperty({
    description: 'Job status',
    example: 'QUEUED',
  })
  status!: string;

  @ApiProperty({
    description: 'Estimated processing time in seconds',
    example: 300,
  })
  estimatedTime!: number;

  @ApiProperty({
    description: 'Message',
    example: 'Video processing job queued successfully',
  })
  message!: string;
}

export class VideoStatusResponseDto {
  @ApiProperty({
    description: 'Job status',
    example: 'PROCESSING',
  })
  status!: string;

  @ApiProperty({
    description: 'Progress percentage (0-100)',
    example: 45,
  })
  progress!: number;

  @ApiProperty({
    description: 'Current processing step',
    example: 'TRANSCRIBING',
  })
  currentStep!: string;

  @ApiPropertyOptional({
    description: 'Job start timestamp',
    example: '2025-10-30T10:30:00Z',
  })
  startedAt?: Date;

  @ApiPropertyOptional({
    description: 'Estimated completion timestamp',
    example: '2025-10-30T10:35:00Z',
  })
  estimatedCompletion?: Date;

  @ApiPropertyOptional({
    description: 'Dubbed video URL (only when COMPLETED)',
    example: 'https://cdn.example.com/videos/dubbed/video123.mp4',
  })
  dubbedVideoUrl?: string;

  @ApiPropertyOptional({
    description: 'HLS playlist URL (only when COMPLETED)',
    example: 'https://cdn.example.com/videos/hls/video123.m3u8',
  })
  hlsPlaylistUrl?: string;

  @ApiPropertyOptional({
    description: 'Subtitles URL (only when COMPLETED)',
    example: 'https://cdn.example.com/videos/subtitles/video123.vtt',
  })
  subtitlesUrl?: string;

  @ApiPropertyOptional({
    description: 'Error message (only when FAILED)',
    example: 'Failed to download video from 1688',
  })
  errorMessage?: string;

  @ApiPropertyOptional({
    description: 'Retry count',
    example: 0,
  })
  retryCount?: number;
}

export class VideoDubbingJobListResponseDto {
  @ApiProperty({
    description: 'Total number of jobs',
    example: 10,
  })
  total!: number;

  @ApiProperty({
    description: 'Array of video dubbing jobs',
    type: [VideoStatusResponseDto],
  })
  jobs!: VideoStatusResponseDto[];
}
