import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RequestPasswordResetDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class ConfirmPasswordResetDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;

  // Minimum mirrors ChangePasswordDto so a password that can be set through the
  // authenticated flow can always be set again through the reset flow.
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
