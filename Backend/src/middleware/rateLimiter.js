import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import AppError from '../utils/AppError.js';

// express-rate-limit v8: the option is `limit`, not the deprecated `max`. Any custom
// keyGenerator must run the IP through ipKeyGenerator so IPv6 clients are bucketed by
// subnet rather than by individual address — otherwise they rotate past the limit for
// free. Over-limit requests go through AppError so the client sees the same error shape
// as everything else.

const overLimit = (_req, _res, next) => next(AppError.tooManyRequests());

// Broad limiter for the whole /api surface.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: overLimit,
});

// Tight limiter for credential endpoints. Keyed by IP *and* email so one attacker cannot
// lock out a shared office IP, and one account cannot be sprayed from many addresses.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.email ?? '').toLowerCase()}`,
  handler: overLimit,
});

/**
 * For the public endpoints that call a pa oe. 
*Uatetctdadmtrd ihu  ih ii,ayn ihalo a u pa
*OeA ilaantannrft eeoseog htapro orking through tehl
*wde ee isi   elvstrak  adu fqetos o it. /epr os iiie  aeii(
 idws 5*6  00
lmt 0
 tnadedr:'rf-'
 eayedr:fle
 ade:oeLmt
)
/*  o uhniae npit httk  asodo te ert—cag-asod  en h n htmtes
*  ee ytesge-nue,NTb Peallk uhiie:teei oeali h
*bd obce n ota iie ol olpeeeysafmme eidoeofc
*NTadesit  igealwneadltoepro' yo okotters.  al akt Pol fi ssmhwrahdbfr uhniae
*
xotcntsniieciniie  aeii(
 idws 5*6  00
lmt 0
 tnadedr:'rf-'
 eayedr:fle
kyeeao:(e)= rque  ue:{e.sr_d`:iKyeeao(e.p)
hnlr vrii,};
/Vr ih iie o h eoeyfosta
 edeal—t).toLowerCase(}`,
  hander: oveLimit,
});











































































































































































































































































































































































































--