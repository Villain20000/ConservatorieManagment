import { createHash } from 'node:crypto';

export interface MyDataInvoiceParams {
  issuerVat: string;
  counterpartyVat?: string | null;
  counterpartyName?: string | null;
  invoiceType: string; // "11.2" (ΑΠΥ) or "2.1" (ΤΠΥ)
  series: string;
  aa: string;
  issueDate: Date; // e.g. 2026-10-25
  netCents: number;
  vatCents: number;
  grossCents: number;
  vatExemptionCategory?: number; // 7 for Article 22
  paymentMethodCode?: number; // 3 = POS/Card, 5 = Bank Transfer, 1 = Cash
}

export function formatEuroAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function computeMyDataUid(params: {
  issuerVat: string;
  issueDateIso: string;
  branch: number;
  invoiceType: string;
  series: string;
  aa: string;
}): string {
  const raw = `${params.issuerVat}-${params.issueDateIso}-${params.branch}-${params.invoiceType}-${params.series}-${params.aa}`;
  return createHash('sha1').update(raw).digest('hex').toUpperCase();
}

export function buildMyDataQrUrl(params: {
  mark: string;
  uid: string;
  netFormatted: string;
  vatFormatted: string;
}): string {
  return `https://www.aade.gr/mydata/qr?mark=${encodeURIComponent(params.mark)}&uid=${encodeURIComponent(params.uid)}&net=${params.netFormatted}&vat=${params.vatFormatted}`;
}

export function buildAadeInvoiceXml(params: MyDataInvoiceParams): {
  xml: string;
  uid: string;
  issueDateIso: string;
} {
  const issueDateIso = params.issueDate.toISOString().slice(0, 10);
  const netFormatted = formatEuroAmount(params.netCents);
  const vatFormatted = formatEuroAmount(params.vatCents);
  const grossFormatted = formatEuroAmount(params.grossCents);
  const exemptionCat = params.vatExemptionCategory ?? 7;
  const payMethod = params.paymentMethodCode ?? 3;

  const uid = computeMyDataUid({
    issuerVat: params.issuerVat,
    issueDateIso,
    branch: 0,
    invoiceType: params.invoiceType,
    series: params.series,
    aa: params.aa,
  });

  const counterpartyBlock = params.counterpartyVat
    ? `    <counterparty>
      <vatNumber>${params.counterpartyVat}</vatNumber>
      <country>GR</country>
      <branch>0</branch>
      ${params.counterpartyName ? `<name>${params.counterpartyName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</name>` : ''}
    </counterparty>`
    : '';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<InvoicesDoc xmlns="http://www.aade.gr/myDATA/invoice/v1.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <invoice>
    <uid>${uid}</uid>
    <issuer>
      <vatNumber>${params.issuerVat}</vatNumber>
      <country>GR</country>
      <branch>0</branch>
    </issuer>
${counterpartyBlock ? counterpartyBlock + '\n' : ''}    <invoiceHeader>
      <series>${params.series}</series>
      <aa>${params.aa}</aa>
      <issueDate>${issueDateIso}</issueDate>
      <invoiceType>${params.invoiceType}</invoiceType>
      <currency>EUR</currency>
    </invoiceHeader>
    <paymentMethods>
      <paymentMethodDetails>
        <type>${payMethod}</type>
        <amount>${grossFormatted}</amount>
      </paymentMethodDetails>
    </paymentMethods>
    <invoiceDetails>
      <lineNumber>1</lineNumber>
      <netValue>${netFormatted}</netValue>
      <vatCategory>8</vatCategory>
      <vatExemptionCategory>${exemptionCat}</vatExemptionCategory>
      <vatAmount>${vatFormatted}</vatAmount>
      <grossValue>${grossFormatted}</grossValue>
      <incomeClassification>
        <classificationType>E3_561_003</classificationType>
        <classificationCategory>category1_3</classificationCategory>
        <amount>${netFormatted}</amount>
      </incomeClassification>
    </invoiceDetails>
    <invoiceSummary>
      <totalNetValue>${netFormatted}</totalNetValue>
      <totalVatAmount>${vatFormatted}</totalVatAmount>
      <totalWithheldAmount>0.00</totalWithheldAmount>
      <totalFeesAmount>0.00</totalFeesAmount>
      <totalStampDutyAmount>0.00</totalStampDutyAmount>
      <totalOtherTaxesAmount>0.00</totalOtherTaxesAmount>
      <totalDeductionsAmount>0.00</totalDeductionsAmount>
      <totalGrossValue>${grossFormatted}</totalGrossValue>
      <incomeClassification>
        <classificationType>E3_561_003</classificationType>
        <classificationCategory>category1_3</classificationCategory>
        <amount>${netFormatted}</amount>
      </incomeClassification>
    </invoiceSummary>
  </invoice>
</InvoicesDoc>`;

  return { xml, uid, issueDateIso };
}
