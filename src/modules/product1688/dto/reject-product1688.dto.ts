import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { RejectionReason } from '@prisma/client';

export class RejectProduct1688Dto {
  @ApiProperty({
    description: 'Rejection reason',
    enum: RejectionReason,
    example: RejectionReason.LOW_QUALITY,
  })
  @IsEnum(RejectionReason)
  @IsNotEmpty()
  reason!: RejectionReason;

  @ApiPropertyOptional({
    description: 'Additional note/comment about rejection',
    example: 'Material quality does not meet our standards',
  })
  @IsString()
  @IsOptional()
  note?: string;
}
