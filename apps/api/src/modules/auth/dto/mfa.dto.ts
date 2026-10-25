import { IsNotEmpty, IsString, Length } from 'class-validator';

/**
 * Codes are deliberately loose: the same field accepts a 6-digit TOTP token or
 * a `XXXX-XXXX` recovery code, and validation should never be the thing that
 * tells an attacker which of the two a value looks like.
 */
const CODE_LENGTH = { min: 6, max: 20 } as const;

export class VerifyMfaDto {
  @IsString()
  @IsNotEmpty()
  challengeToken!: string;

  @IsString()
  @Length(CODE_LENGTH.min, CODE_LENGTH.max)
  code!: string;
}

export class ActivateMfaDto {
  @IsString()
  @Length(CODE_LENGTH.min, CODE_LENGTH.max)
  code!: string;
}

export class DisableMfaDto {
  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsString()
  @Length(CODE_LENGTH.min, CODE_LENGTH.max)
  code!: string;
}

export class RegenerateRecoveryCodesDto {
  @IsString()
  @IsNotEmpty()
  password!: string;
}
