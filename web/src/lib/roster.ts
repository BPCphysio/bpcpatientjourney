// One person, one folder, whichever way they spell their name. Carried over
// from the first version. Each row: the display name first, then every other
// spelling of the SAME person. The clinic's People sheet adds to this.
export const NAME_ALIASES = [
  ['Aris', 'อริส'],
  ['Kun', 'กุ่น'],
  ['Bua', 'บัว'],
  ['Jetam', 'เฌอแตม'],
  ['Tee', 'ตี้'],
  ['Gear', 'เกียร์'],
  ['Oil', 'ออย'],
  ['Boom', 'บูม'],
  ['Nut', 'นัท'],
  ['Beam', 'บีม'],
  ['Pleng', 'เพลง'],
  ['Ford', 'ฟอร์ด'],
  ['Cream', 'ครีม'],
  ['Gift', 'กิ๊ฟ'],
  ['Phing', 'ผิง'],
  ['Jimmy', 'จิมมี่'],
  ['Tul', 'ตุล'],
  ['Sai', 'ทราย'],
  ['Fah', 'ฟ้า'],
  ['Kat', 'แคท'],
  ['Moothong', 'หมูทอง'],
  ['Blue', 'บลู'],
  ['Opal', 'โอปอล'],
  ['Can', 'แคน'],
  ['Bump', 'บั๊ม'],
  ['Mighty', 'ไมตี้'],
  ['Earth', 'เอิร์ท'],
  ['Ninew', 'นินิว'],
  ['Gale', 'เกล'],
  ['Thun', 'ธัน'],
  ['Kwang', 'กวาง'],
  ['Gam', 'แก้ม'],
  ['Pik', 'ปิ๊ก'],
  ['Best', 'เบส'],
  ['Pim', 'ภิม'],
  ['Tong', 'ตง'],
  ['Gomen', 'โกเมน'],
  ['Oat', 'โอ็ต', 'โอ๊ต'],

  // Seniors — the P' prefix is optional when typing.
  ["P'Big", 'บิ๊ก', 'Big'],

  // TWO PEOPLE SHARE ONE THAI SPELLING: พลอย
  // Janisata (P'Ploy) and Waranya (PloyR) both write พลอย, so bare พลอย cannot
  // be assigned to either without risking merging two people's work. Each is
  // listed under their distinguishing spelling instead; ask these two to type
  // the English form. Bare พลอย lands in its own folder as a visible signal.
  ["P'Ploy", "p'พลอย", 'PloyJ'],
  ['PloyR', 'พลอยR', 'PloyW']
];

// Until the Markers tab has been read once on this device.
export const DEFAULT_MARKERS = [
  ['Sathorn', 'Gale'], ['Sathorn', 'Kun'], ['Sathorn', "P'Ploy"], ['Sathorn', 'Phing'], ['Sathorn', 'PloyR'], ['Sathorn', 'Tee'],
  ['Sukhumvit', 'Gift'], ['Sukhumvit', 'Kwang'], ['Sukhumvit', 'Moothong'], ['Sukhumvit', 'Ninew'], ['Sukhumvit', 'Pik'], ['Sukhumvit', 'Tee'],
  ['Sanam Pao', 'Tee'], ['Sanam Pao', 'Blue'], ['Sanam Pao', 'Nut'],
  ['All branches', 'Nimit']
].map(x => ({ branch: x[0], name: x[1] }));
