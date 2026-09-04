import type { DealActivity, Opportunity } from "./types";

interface Seed {
  contactName: string;
  phone: string;
  city: string;
  source: Opportunity["source"];
  product: Opportunity["product"];
  company?: string;
  expectedPremium: number;
  probability: number;
  stage: Opportunity["stage"];
  owner: string;
  nextAction: string;
  /** روز نسبت به امروز */
  next: number;
  created: number;
  lostReason?: string;
  notes: { kind: DealActivity["kind"]; body: string; at: number }[];
}

const SEEDS: Seed[] = [
  {
    contactName: "علی مرادی",
    phone: "09121234567",
    city: "تهران",
    source: "تماس ورودی",
    product: "شخص ثالث",
    expectedPremium: 42_000_000,
    probability: 20,
    stage: "سرنخ جدید",
    owner: "سمیرا کریمی",
    nextAction: "تماس اول و نیازسنجی خودرو",
    next: 1,
    created: -2,
    notes: [
      { kind: "call", body: "تماس ورودی از تبلیغ اینستاگرام؛ خودرو پژو ۲۰۷ مدل ۱۴۰۲.", at: -2 },
      { kind: "note", body: "ترجیح مشتری: پرداخت اقساطی ۴ قسطه.", at: -1 },
    ],
  },
  {
    contactName: "زهرا نیکخواه",
    phone: "09131002233",
    city: "اصفهان",
    source: "اینستاگرام",
    product: "درمان تکمیلی",
    expectedPremium: 88_000_000,
    probability: 25,
    stage: "سرنخ جدید",
    owner: "نگار موسوی",
    nextAction: "ارسال کاتالوگ طرح‌های خانواده",
    next: -2,
    created: -6,
    notes: [
      { kind: "whatsapp", body: "پیام دایرکت اینستاگرام؛ خانواده ۴ نفره.", at: -6 },
      { kind: "note", body: "منتظر اعلام سقف تعهدات مورد نظر مشتری.", at: -4 },
    ],
  },
  {
    contactName: "شرکت فولاد آریا",
    phone: "02188223344",
    city: "تهران",
    source: "نمایشگاه",
    product: "آتش‌سوزی",
    company: "بیمه ایران",
    expectedPremium: 640_000_000,
    probability: 35,
    stage: "نیازسنجی",
    owner: "نگار موسوی",
    nextAction: "جلسه بازدید از انبار مرکزی",
    next: 3,
    created: -14,
    notes: [
      { kind: "meeting", body: "جلسه معارفه در غرفه نمایشگاه؛ ارزش موجودی انبار حدود ۹۰ میلیارد ریال.", at: -14 },
      { kind: "call", body: "هماهنگی بازدید کارشناس با مدیر HSE.", at: -6 },
      { kind: "note", body: "نیاز به پوشش زلزله و سیل.", at: -5 },
    ],
  },
  {
    contactName: "مهدی سلطانی",
    phone: "09151119988",
    city: "مشهد",
    source: "معرفی مشتری",
    product: "بدنه",
    expectedPremium: 210_000_000,
    probability: 40,
    stage: "نیازسنجی",
    owner: "سمیرا کریمی",
    nextAction: "دریافت مدارک خودرو و کارت ملی",
    next: 2,
    created: -9,
    notes: [
      { kind: "call", body: "معرفی از سوی آقای رستمی؛ خودرو هایما S7.", at: -9 },
      { kind: "sms", body: "ارسال پیامک فهرست مدارک مورد نیاز.", at: -7 },
    ],
  },
  {
    contactName: "پریسا فراهانی",
    phone: "09361200044",
    city: "کرج",
    source: "وب‌سایت",
    product: "عمر و سرمایه‌گذاری",
    company: "بیمه پاسارگاد",
    expectedPremium: 120_000_000,
    probability: 45,
    stage: "استعلام حق بیمه",
    owner: "آرش امینی",
    nextAction: "استعلام نرخ از دو شرکت بیمه",
    next: 1,
    created: -11,
    notes: [
      { kind: "note", body: "فرم درخواست از وب‌سایت ثبت شد.", at: -11 },
      { kind: "call", body: "تعیین حق بیمه ماهانه هدف: ۱۰ میلیون ریال.", at: -8 },
    ],
  },
  {
    contactName: "حامد بهرامی",
    phone: "09141234000",
    city: "تبریز",
    source: "تمدید بیمه‌نامه",
    product: "شخص ثالث",
    company: "بیمه دی",
    expectedPremium: 58_000_000,
    probability: 55,
    stage: "استعلام حق بیمه",
    owner: "سمیرا کریمی",
    nextAction: "اعلام نرخ تمدید با تخفیف عدم خسارت",
    next: 4,
    created: -8,
    notes: [
      { kind: "sms", body: "یادآوری سررسید تمدید ارسال شد.", at: -8 },
      { kind: "call", body: "مشتری ۷۰٪ تخفیف عدم خسارت دارد.", at: -3 },
    ],
  },
  {
    contactName: "شیما کاظمی",
    phone: "09122223311",
    city: "تهران",
    source: "واتساپ",
    product: "درمان تکمیلی",
    company: "بیمه سامان",
    expectedPremium: 320_000_000,
    probability: 60,
    stage: "ارسال پیشنهاد",
    owner: "نگار موسوی",
    nextAction: "پیگیری پیش‌فاکتور ارسالی برای شرکت",
    next: 2,
    created: -18,
    notes: [
      { kind: "whatsapp", body: "دریافت لیست ۳۲ نفره پرسنل شرکت.", at: -18 },
      { kind: "meeting", body: "جلسه آنلاین بررسی سقف تعهدات.", at: -10 },
      { kind: "note", body: "پیش‌فاکتور نسخه دوم ارسال شد.", at: -4 },
    ],
  },
  {
    contactName: "کیوان زارعی",
    phone: "09171234512",
    city: "شیراز",
    source: "معرفی مشتری",
    product: "بدنه",
    company: "بیمه البرز",
    expectedPremium: 175_000_000,
    probability: 60,
    stage: "ارسال پیشنهاد",
    owner: "آرش امینی",
    nextAction: "تماس پیگیری پیشنهاد ارسالی",
    next: -1,
    created: -13,
    notes: [
      { kind: "call", body: "اعلام نرخ بدنه با پوشش سرقت درجا.", at: -13 },
      { kind: "sms", body: "ارسال خلاصه پیشنهاد به همراه لینک پرداخت.", at: -6 },
    ],
  },
  {
    contactName: "نیلوفر جعفری",
    phone: "09353334455",
    city: "قم",
    source: "اینستاگرام",
    product: "عمر و سرمایه‌گذاری",
    expectedPremium: 96_000_000,
    probability: 50,
    stage: "ارسال پیشنهاد",
    owner: "سمیرا کریمی",
    nextAction: "ارسال جدول اندوخته ۱۰ ساله",
    next: 5,
    created: -7,
    notes: [
      { kind: "whatsapp", body: "درخواست مقایسه دو طرح عمر.", at: -7 },
      { kind: "note", body: "حساسیت بالا روی نرخ سود تضمینی.", at: -5 },
    ],
  },
  {
    contactName: "شرکت داروسازی رازی",
    phone: "02177889900",
    city: "تهران",
    source: "تماس ورودی",
    product: "مسئولیت",
    company: "بیمه معلم",
    expectedPremium: 450_000_000,
    probability: 70,
    stage: "مذاکره",
    owner: "نگار موسوی",
    nextAction: "مذاکره نهایی روی فرانشیز",
    next: 1,
    created: -25,
    notes: [
      { kind: "meeting", body: "جلسه حضوری با مدیر مالی.", at: -20 },
      { kind: "call", body: "درخواست کاهش فرانشیز به ۵٪.", at: -9 },
      { kind: "note", body: "رقیب: پیشنهاد نماینده دیگر با نرخ نزدیک.", at: -3 },
    ],
  },
  {
    contactName: "رضا اکبری",
    phone: "09161230099",
    city: "اهواز",
    source: "تمدید بیمه‌نامه",
    product: "آتش‌سوزی",
    company: "بیمه کوثر",
    expectedPremium: 130_000_000,
    probability: 75,
    stage: "مذاکره",
    owner: "سمیرا کریمی",
    nextAction: "توافق روی تعداد اقساط",
    next: 2,
    created: -16,
    notes: [
      { kind: "call", body: "تمدید بیمه‌نامه واحد تجاری.", at: -16 },
      { kind: "sms", body: "ارسال نرخ تمدید.", at: -8 },
    ],
  },
  {
    contactName: "سعید نوروزی",
    phone: "09199876543",
    city: "تهران",
    source: "وب‌سایت",
    product: "شخص ثالث",
    company: "بیمه ایران",
    expectedPremium: 63_000_000,
    probability: 90,
    stage: "صدور",
    owner: "آرش امینی",
    nextAction: "ثبت درخواست صدور در سامانه شرکت",
    next: 1,
    created: -12,
    notes: [
      { kind: "call", body: "تأیید نهایی مشتری برای صدور.", at: -3 },
      { kind: "note", body: "پرداخت پیش‌قسط انجام شد.", at: -1 },
    ],
  },
  {
    contactName: "مریم شریفی",
    phone: "09124440011",
    city: "تهران",
    source: "معرفی مشتری",
    product: "درمان تکمیلی",
    company: "بیمه سامان",
    expectedPremium: 240_000_000,
    probability: 90,
    stage: "صدور",
    owner: "نگار موسوی",
    nextAction: "دریافت مدارک نهایی و صدور بیمه‌نامه",
    next: 3,
    created: -21,
    notes: [
      { kind: "meeting", body: "جلسه امضای قرارداد گروهی.", at: -5 },
      { kind: "whatsapp", body: "ارسال فایل نهایی لیست بیمه‌شدگان.", at: -2 },
    ],
  },
  {
    contactName: "بهنام قاسمی",
    phone: "09183332211",
    city: "کرمان",
    source: "واتساپ",
    product: "بدنه",
    expectedPremium: 150_000_000,
    probability: 0,
    stage: "از دست رفته",
    owner: "سمیرا کریمی",
    nextAction: "بایگانی سرنخ",
    next: -10,
    created: -30,
    lostReason: "نرخ رقیب پایین‌تر بود",
    notes: [
      { kind: "call", body: "اعلام نرخ؛ مشتری نرخ را بالا دانست.", at: -22 },
      { kind: "note", body: "انصراف مشتری و انتخاب نماینده دیگر.", at: -11 },
    ],
  },
  {
    contactName: "الهام سلیمی",
    phone: "09112223344",
    city: "رشت",
    source: "نمایشگاه",
    product: "عمر و سرمایه‌گذاری",
    expectedPremium: 72_000_000,
    probability: 0,
    stage: "از دست رفته",
    owner: "آرش امینی",
    nextAction: "پیگیری مجدد در فصل بعد",
    next: -5,
    created: -45,
    lostReason: "عدم پاسخگویی مشتری",
    notes: [
      { kind: "sms", body: "سه نوبت پیامک پیگیری ارسال شد.", at: -20 },
      { kind: "call", body: "تماس بدون پاسخ.", at: -12 },
    ],
  },
  {
    contactName: "امیر دهقان",
    phone: "09355558877",
    city: "یزد",
    source: "تماس ورودی",
    product: "مسئولیت",
    expectedPremium: 98_000_000,
    probability: 30,
    stage: "نیازسنجی",
    owner: "آرش امینی",
    nextAction: "بررسی نوع فعالیت کارگاه و تعداد کارگران",
    next: 6,
    created: -4,
    notes: [
      { kind: "call", body: "کارگاه ساختمانی با ۱۲ کارگر.", at: -4 },
      { kind: "note", body: "نیاز به پوشش مسئولیت کارفرما.", at: -3 },
    ],
  },
];

export function buildPipelineSeed(iso: (offsetDays: number) => string) {
  const opportunities: Opportunity[] = [];
  const dealActivities: DealActivity[] = [];

  SEEDS.forEach((s, i) => {
    const id = `OP-${2000 + i}`;
    opportunities.push({
      id,
      title: `${s.product} — ${s.contactName}`,
      contactName: s.contactName,
      phone: s.phone,
      city: s.city,
      source: s.source,
      product: s.product,
      company: s.company,
      expectedPremium: s.expectedPremium,
      probability: s.probability,
      stage: s.stage,
      owner: s.owner,
      nextAction: s.nextAction,
      nextActionAt: iso(s.next),
      lostReason: s.lostReason,
      createdAt: iso(s.created),
      updatedAt: iso(Math.max(s.created, s.notes[s.notes.length - 1]?.at ?? s.created)),
    });

    s.notes.forEach((n, k) => {
      dealActivities.push({
        id: `DA-${3000 + i * 10 + k}`,
        opportunityId: id,
        kind: n.kind,
        body: n.body,
        at: iso(n.at),
        by: s.owner,
      });
    });
  });

  return { opportunities, dealActivities };
}
