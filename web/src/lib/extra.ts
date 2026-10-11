// Wording the first version built inline (carried over unchanged), plus the
// few new labels the new layout needs.
import type { Lang } from './strings'

export const X = {
  en: {
    resumeNote: (name: string, n: number, total: number) => `Welcome back, ${name}. You stopped at case ${n} of ${total} — what you had written is still there.`,
    knownNote: (hasRoster: boolean) => (hasRoster ? 'Tap your name:' : 'Used on this device:'),
    checking: 'Checking your progress with the clinic…',
    pendingNote: (n: number) => `${n} ${n === 1 ? 'answer is' : 'answers are'} waiting to send — they go automatically when there is signal; just open this page for a moment somewhere with a good connection.`,
    betweenTitle: 'Your answers are with the clinic.',
    betweenQueued: 'Saved — will send when there is signal.',
    seeWhere: 'See where you got to',
    doneBody: 'That set climbed from difficulty 1 to difficulty 5. If you want more, the next set is drawn from the cases you have not answered yet.',
    trackLabel: (level: number) => `Before the visit · difficulty ${level}/5`,
    sent: 'A senior physiotherapist will check them and come back to you with a mark and comments.',
    reached: 'Your answers did reach the clinic.',
    queuedBody: 'Your answers are kept on this device and will send themselves when there is a connection. Nothing more to do; carry on to the next case.',
    thPartial: '',
    // new in this version
    journey: ['Read the chart', 'Choose before arrival', 'Your call', 'The reveal', 'Your picture'],
    stepChart: 'The chart', stepPlan: 'Before the patient arrives', stepCall: 'The call', stepWhy: 'Why those three', stepReveal: 'What the call found', stepVisual: 'The picture on the screen',
    typeOr: 'Type, dictate, or record your answer.',
    locked: 'Locked after the reveal',
    staffLink: 'Clinic staff',
    difficulty: 'Difficulty'
  },
  th: {
    resumeNote: (name: string, n: number, total: number) => `ยินดีต้อนรับกลับ ${name} — คุณค้างอยู่ที่เคสที่ ${n} จาก ${total} คำตอบที่เขียนไว้ยังอยู่`,
    knownNote: (hasRoster: boolean) => (hasRoster ? 'แตะชื่อของคุณ:' : 'เคยใช้ชื่อนี้บนเครื่องนี้:'),
    checking: 'กำลังตรวจสอบความคืบหน้าของคุณกับคลินิก…',
    pendingNote: (n: number) => `มี ${n} คำตอบรอส่ง — จะส่งให้เองเมื่อมีสัญญาณ เปิดหน้านี้ทิ้งไว้สักครู่เมื่อมีสัญญาณดี`,
    betweenTitle: 'ส่งคำตอบเรียบร้อยแล้ว',
    betweenQueued: 'เก็บคำตอบไว้แล้ว — จะส่งเมื่อมีสัญญาณ',
    seeWhere: 'ดูสรุป',
    doneBody: 'ชุดนี้ไต่ความยากจากระดับ 1 ถึงระดับ 5 ถ้าต้องการทำต่อ ระบบจะสุ่มเคสใหม่จากเคสที่คุณยังไม่เคยทำ',
    trackLabel: (level: number) => `ก่อนคนไข้มาถึง · ระดับความยาก ${level}/5`,
    sent: 'นักกายภาพบำบัดอาวุโสจะตรวจคำตอบของคุณ แล้วให้คะแนนและความเห็นกลับมา',
    reached: 'คำตอบของคุณถึงคลินิกแล้ว',
    queuedBody: 'คำตอบถูกเก็บไว้บนเครื่องนี้ และจะส่งให้เองเมื่อมีการเชื่อมต่อ ไม่ต้องทำอะไรเพิ่ม ทำเคสถัดไปต่อได้เลย',
    thPartial: 'ชาร์ตของเคสนี้ยังเป็นภาษาอังกฤษ (ยังแปลไม่เสร็จ) — คำถามและคำตอบคุณตอบเป็นภาษาไทยได้ตามปกติ',
    journey: ['อ่านชาร์ต', 'เลือกสิ่งที่ทำก่อนคนไข้มา', 'การโทรของคุณ', 'เปิดเผยการโทร', 'รูปที่จะเปิดให้ดู'],
    stepChart: 'ชาร์ต', stepPlan: 'ก่อนคนไข้มาถึง', stepCall: 'การโทร', stepWhy: 'ทำไมต้อง 3 ข้อนี้', stepReveal: 'สิ่งที่ได้จากการโทร', stepVisual: 'รูปที่เปิดไว้บนจอ',
    typeOr: 'พิมพ์ พูดแทนพิมพ์ หรืออัดเสียงคำตอบก็ได้',
    locked: 'ล็อกแล้วหลังเปิดเผยการโทร',
    staffLink: 'เจ้าหน้าที่คลินิก',
    difficulty: 'ระดับความยาก'
  }
} satisfies Record<Lang, unknown>
