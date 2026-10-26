import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateSignatureRequestDto {
  @IsString()
  @IsNotEmpty()
  documentId!: string;

  @IsString()
  @MinLength(2)
  signerName!: string;

  @IsEmail()
  signerEmail!: string;

  @IsString()
  @IsIn(['STUDENT', 'GUARDIAN', 'DIRECTOR', 'TEACHER'])
  signerRole!: string;

  @IsOptional()
  @IsString()
  @IsIn(['GOV_GR', 'DOCUSIGN', 'INTERNAL_EIDAS'])
  provider?: string = 'INTERNAL_EIDAS';
}

export class SignDocumentDto {
  @IsOptional()
  @IsString()
  otpCode?: string;

  @IsOptional()
  @IsString()
  signatureGraphicData?: string;
}

export class SignatureWebhookDto {
  @IsString()
  @IsNotEmpty()
  externalEnvelopeId!: string;

  @IsString()
  @IsNotEmpty()
  eventType!: string; // 'envelope.signed' | 'envelope.declined'

  @IsOptional()
  @IsString()
  auditCertificateUrl?: string;

  @IsOptional()
  @IsString()
  signedAt?: string;
}
