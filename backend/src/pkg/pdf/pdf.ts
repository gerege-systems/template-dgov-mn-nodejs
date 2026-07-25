// Government Template Platform V3.0
// Gerege Systems Development Team болон Claude AI хамтран бүтээв, 2026.

// PDF-ийн хоёр үйлдэл: (1) визуал гарын үсэг/тамгыг сүүлчийн хуудсанд
// давхарлах, (2) серверийн Document-Signer-ээр PAdES гарын үсэг шигтгэх.
//
// Go хувилбар нь pdfcpu (watermark) + digitorus/pdfsign ашигладаг; Node дээр
// pdf-lib (зураг) + @signpdf (PKCS#7 detached) хосыг хэрэглэнэ. Гаралт нь адил:
// сүүлчийн хуудасны баруун доод буланд зураг, PDF дотор гарын үсгийн dictionary.

import { PDFDocument } from 'pdf-lib';
import forge from 'node-forge';
import { SignPdf } from '@signpdf/signpdf';
import { P12Signer } from '@signpdf/signer-p12';
import { plainAddPlaceholder } from '@signpdf/placeholder-plain';

/** ImagePlacement нь зургийг хуудсанд байрлуулах харьцаа/шилжилт. */
/**
 * saveOptions нь pdf-lib-ийн бичилтийг СОНГОДОГ xref хүснэгттэй байлгана —
 * PAdES шигтгэгч xref stream-ийг уншиж чаддаггүй.
 */
const saveOptions = { useObjectStreams: false } as const;

export interface ImagePlacement {
  /** scale нь хуудасны ӨРГӨНӨӨС эзлэх хувь (0–1). */
  scale: number;
  /** offsetX нь баруун ирмэгээс зүүн тийш (цэг). */
  offsetX: number;
  /** offsetY нь доод ирмэгээс дээш (цэг). */
  offsetY: number;
}

/**
 * overlayImageLastPage нь зургийг ЗӨВХӨН сүүлчийн хуудсанд давхарлана.
 * PNG болон JPEG-ийг дэмжинэ; бусад форматад алдаа шиднэ (дуудагч алгасна).
 */
export async function overlayImageLastPage(
  pdfBytes: Buffer,
  imgBytes: Buffer,
  placement: ImagePlacement,
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);
  const pages = doc.getPages();
  const page = pages[pages.length - 1];
  if (!page) throw new Error('pdf: хуудас олдсонгүй');

  // Формат нь агуулгаараа тодорхойлогдоно (өргөтгөлд итгэхгүй).
  const isPng =
    imgBytes.length > 8 && imgBytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  const isJpeg = imgBytes.length > 3 && imgBytes[0] === 0xff && imgBytes[1] === 0xd8;
  if (!isPng && !isJpeg) throw new Error('pdf: зөвхөн PNG/JPEG зураг дэмжигдэнэ');
  const image = isPng ? await doc.embedPng(imgBytes) : await doc.embedJpg(imgBytes);

  const { width: pw } = page.getSize();
  const targetWidth = pw * placement.scale;
  const dims = image.scale(targetWidth / image.width);
  page.drawImage(image, {
    x: pw - dims.width - placement.offsetX,
    y: placement.offsetY,
    width: dims.width,
    height: dims.height,
  });
  return Buffer.from(await doc.save(saveOptions));
}

/**
 * normalizePdf нь PDF-ийг СОНГОДОГ xref хүснэгттэй болгож дахин бичнэ.
 *
 * ЯАГААД: PAdES шигтгэгч (@signpdf) нь xref STREAM-тэй (шахсан) PDF-ийг
 * задалж чаддаггүй. Хэвийшүүлэлтийг иргэн PIN2-оор баталгаажуулах digest
 * тооцохоос ӨМНӨ хийнэ — ингэснээр зөвшөөрсөн байтууд болон эцсийн файлын
 * суурь байтууд ЯГ ижил үлдэж, гарын үсэг нь инкрементал нэмэлт болно.
 */
export async function normalizePdf(pdfBytes: Buffer): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes);
  return Buffer.from(await doc.save(saveOptions));
}

/** SignerIdentity нь серверийн Document-Signer (гэрчилгээ + хувийн түлхүүр). */
export interface SignerIdentity {
  /** certPem нь X.509 гэрчилгээ (PEM). */
  certPem: string;
  /** keyPem нь хувийн түлхүүр (PEM — PKCS#8 эсвэл EC/RSA). */
  keyPem: string;
  /** p12 нь signpdf-д өгөх PKCS#12 багц (PEM хосоос үүсгэгдэнэ). */
  p12: Buffer;
  /** commonName нь гэрчилгээний CN (лог/тайланд). */
  commonName: string;
}

/** p12Passphrase нь process-ын дотор л амьдардаг түр нууц (диск рүү гардаггүй). */
const p12Passphrase = 'signpdf';

/**
 * buildSignerFromPem нь PEM гэрчилгээ + түлхүүрээс PKCS#12 багц угсарна —
 * @signpdf нь ЗӨВХӨН p12 хүлээж авдаг тул хөрвүүлэлт зайлшгүй. Түлхүүр нь
 * процессын санах ойгоос гардаггүй.
 */
export function buildSignerFromPem(certPem: string, keyPem: string): SignerIdentity {
  let cert: forge.pki.Certificate;
  try {
    cert = forge.pki.certificateFromPem(certPem);
  } catch (err) {
    throw new Error(`sign: signer cert PEM буруу: ${String(err)}`);
  }
  let key: forge.pki.PrivateKey;
  try {
    key = forge.pki.privateKeyFromPem(keyPem);
  } catch (err) {
    throw new Error(`sign: signer key PEM буруу: ${String(err)}`);
  }

  const asn1 = forge.pkcs12.toPkcs12Asn1(key, [cert], p12Passphrase, {
    algorithm: '3des',
  });
  const der = forge.asn1.toDer(asn1).getBytes();
  const cn = cert.subject.getField('CN') as { value?: string } | null;
  return {
    certPem,
    keyPem,
    p12: Buffer.from(der, 'binary'),
    commonName: cn?.value ?? '',
  };
}

/** SignInfo нь PDF-ийн гарын үсгийн dictionary-д бичигдэх мэдээлэл. */
export interface SignInfo {
  name: string;
  reason: string;
  location?: string;
  contactInfo?: string;
}

/**
 * embedPAdES нь PDF-д гарын үсгийн placeholder нэмээд PKCS#7 detached гарын
 * үсгийг серверийн Document-Signer-ээр шигтгэнэ.
 *
 * Гарын үсэг өөрөө иргэний PIN2 (eID) баталгаажуулалтыг ОРЛОХГҮЙ — иргэний
 * зөвшөөрөл нь eidmongolia session-д аль хэдийн бичигдсэн; энэ нь баримтын
 * бүрэн бүтэн байдлыг сервер талаас лацдах давхарга (eidmongolia-ийн албан
 * ёсны stamp боломжгүй үеийн fallback).
 */
export async function embedPAdES(
  pdfBytes: Buffer,
  signer: SignerIdentity,
  info: SignInfo,
): Promise<Buffer> {
  const withPlaceholder = plainAddPlaceholder({
    pdfBuffer: pdfBytes,
    reason: info.reason,
    contactInfo: info.contactInfo ?? '',
    name: info.name,
    location: info.location ?? '',
  });
  const p12Signer = new P12Signer(signer.p12, { passphrase: p12Passphrase });
  const signed = await new SignPdf().sign(withPlaceholder, p12Signer);
  return Buffer.from(signed);
}
