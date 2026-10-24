import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pdfMake from 'pdfmake';
import {
  DOCUMENT_TEMPLATES,
  getTemplate,
  type TDocumentDefinitions,
  type TemplateContext,
} from './templates.js';

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(config: ConfigService) {
    const fontDir = config.get<string>('FONTS_DIR') ?? join(process.cwd(), 'assets', 'fonts');
    const regular = join(fontDir, 'DejaVuSans.ttf');
    const bold = join(fontDir, 'DejaVuSans-Bold.ttf');
    if (!existsSync(regular) || !existsSync(bold)) {
      this.logger.warn(`Greek PDF fonts are missing from ${fontDir}`);
    }
    const fontRoot = resolve(fontDir);
    pdfMake.addFonts({ DejaVuSans: { normal: regular, bold } });
    pdfMake.setLocalAccessPolicy((path) => resolve(path).startsWith(fontRoot));
    pdfMake.setUrlAccessPolicy(() => false);
  }

  templates() {
    return DOCUMENT_TEMPLATES.map((template) => ({
      key: template.key,
      title: template.title,
      type: template.type,
    }));
  }

  async render(templateKey: string, context: TemplateContext): Promise<Buffer> {
    const template = getTemplate(templateKey);
    const definition: TDocumentDefinitions = template.build(context);
    return this.renderDefinition(definition);
  }

  async renderDefinition(definition: TDocumentDefinitions): Promise<Buffer> {
    try {
      return await pdfMake.createPdf(definition).getBuffer();
    } catch (error) {
      this.logger.error(`PDF rendering failed: ${String(error)}`);
      throw new ServiceUnavailableException({
        code: 'PDF_RENDER_FAILED',
        message: 'Η δημιουργία του PDF απέτυχε',
      });
    }
  }
}
