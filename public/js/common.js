/* Shared helpers: translations, API calls, small UI utilities. */
(function () {
  'use strict';

  const STRINGS = {
    en: {
      navGroups: 'Classes & VIP',
      groupsSub: 'Add the classes and VIP groups used on seating charts. Changes apply to every event.',
      classes: 'Classes',
      vipGroups: 'VIP Groups',
      addClass: 'Add Class',
      addVip: 'Add VIP Group',
      newClass: 'New Class',
      newVip: 'New VIP Group',
      newGroupBtn: 'New Class or VIP Group',
      groupType: 'Type',
      typeClass: 'Class',
      typeVip: 'VIP',
      code: 'Code',
      codeHint: 'Short label shown on seats, e.g. 7A or VIP-B. It can’t be changed later.',
      groupName: 'Full name',
      color: 'Colour',
      customColor: 'Custom colour',
      delete: 'Delete',
      noneYet: 'None yet.',
      groupCount: (n) => (n === 1 ? '1 group' : `${n} groups`),
      groupSaved: (n) => `Saved “${n}”.`,
      confirmDeleteGroup: (n) => `Delete “${n}”? Seats already assigned keep their colour.`,
      vipGuests: 'VIP Guests',
      vipSeat: 'VIP seat',
      vipHint: 'To seat a VIP guest, open a seating chart, click a seat and choose a VIP group.',
      vipHintShort: 'Click a seat and choose a VIP group to seat a guest.',
      noVips: 'No VIP seats yet.',
      brand: 'CAMC Seating',
      navEvents: 'Events',
      navTeacher: 'Teacher Sign In',
      navTeacherShort: 'Sign In',
      heroEyebrow: 'Auditorium Seating',
      heroTitle: 'Find your seat.',
      heroSub: 'Search for an event to see exactly where every class and guest is sitting.',
      searchEvents: 'Search events',
      noEvents: 'No events have been published yet.',
      noEventsMatch: 'No events match your search.',
      seatsAssigned: 'seats assigned',
      updated: 'Updated',
      by: 'by',
      allEvents: 'All Events',
      findInChart: 'Find a class, name or seat',
      results: (n) => (n === 1 ? '1 seat found' : `${n} seats found`),
      noResults: 'No seats found',
      labelsNumbers: 'Numbers',
      labelsClasses: 'Classes',
      print: 'Print',
      totalSeats: 'Capacity',
      allocated: 'Assigned',
      remaining: 'Available',
      occupancy: 'Occupancy',
      classesHere: 'Classes in this event',
      seat: 'Seat',
      available: 'Available',
      stage: 'Stage',
      mainAisle: 'Main Aisle',
      booth: 'Control Booth',
      balconyL: 'Balcony L',
      balconyR: 'Balcony R',
      extraSeats: 'Additional Seats',
      zoom: 'Zoom',
      eventNotFound: 'This event could not be found.',
      loadError: 'Something went wrong. Please try again.',
      // teacher
      signInTitle: 'Sign in to CAMC Seating',
      signInSub: 'For teachers and administrators.',
      username: 'Username',
      password: 'Password',
      signIn: 'Sign In',
      signOut: 'Sign Out',
      changePassword: 'Change Password',
      currentPassword: 'Current password',
      newPassword: 'New password',
      backToViewer: 'View public seating',
      myEvents: 'Seating Charts',
      myEventsSub: 'Create and edit the seating plan for each event.',
      newEvent: 'New Event',
      newEventPrompt: 'Event name',
      eventDate: 'Date',
      create: 'Create',
      cancel: 'Cancel',
      save: 'Save',
      saved: 'Saved',
      saving: 'Saving…',
      unsaved: 'Unsaved changes',
      undo: 'Undo',
      close: 'Close',
      done: 'Done',
      autoAllocate: 'Auto Allocate',
      autoAllocateSub: 'Fill empty seats for a class in a chosen direction.',
      class: 'Class',
      count: 'People',
      direction: 'Direction',
      buffer: 'Leave one empty seat before this group',
      allocate: 'Allocate',
      dirH1: 'Row by row · seat 1 → 29',
      dirH2: 'Row by row · seat 29 → 1',
      dirV1: 'By zone · right zone first (1–7)',
      dirV2: 'By zone · centre zone first (8–22)',
      dirV3: 'By zone · left zone first (23–29)',
      addSeats: 'Extra Seats',
      addSeatsSub: 'Use the + buttons on the chart to add balcony, aisle and back-row seats.',
      eventSettings: 'Event',
      exportJson: 'Export JSON',
      importJson: 'Import JSON',
      clearAll: 'Clear All Seats',
      deleteEvent: 'Delete Event',
      viewPublic: 'View Public Page',
      editSeat: 'Seat',
      personName: 'Name (optional)',
      personPlaceholder: 'e.g. Guest of honour',
      photo: 'Photo (optional)',
      choosePhoto: 'Choose Photo',
      removePhoto: 'Remove',
      clearSeat: 'Clear Seat',
      removeSeat: 'Remove Seat',
      notEnough: (n) => `Not enough empty seats. ${n} available.`,
      invalidCount: 'Enter how many people to seat.',
      confirmDelete: (n) => `Delete “${n}”? This can’t be undone.`,
      confirmClear: 'Clear every seat in this event?',
      confirmRemoveSeat: (s) => `Remove seat ${s} from the chart?`,
      confirmLeave: 'You have unsaved changes. Leave without saving?',
      importDone: (n) => `Imported “${n}”. Remember to save.`,
      importBad: 'That file isn’t a valid seating layout.',
      emptyEvents: 'No seating charts yet. Create your first event to get started.',
      // admin
      adminTitle: 'Teacher Accounts',
      adminSub: 'Create accounts so teachers can sign in and manage seating charts.',
      newTeacher: 'New Teacher Account',
      fullName: 'Full name',
      createAccount: 'Create Account',
      teachers: 'Teachers',
      noTeachers: 'No teacher accounts yet.',
      accountCreated: (u) => `Account “${u}” created.`,
      created: 'Created',
      passwordChanged: 'Password updated.',
      admin: 'Administrator',
      teacher: 'Teacher',
    },
    th: {
      navGroups: 'ห้องเรียนและ VIP',
      groupsSub: 'เพิ่มห้องเรียนและกลุ่ม VIP ที่ใช้ในผังที่นั่ง การแก้ไขจะมีผลกับทุกงาน',
      classes: 'ห้องเรียน',
      vipGroups: 'กลุ่ม VIP',
      addClass: 'เพิ่มห้องเรียน',
      addVip: 'เพิ่มกลุ่ม VIP',
      newClass: 'ห้องเรียนใหม่',
      newVip: 'กลุ่ม VIP ใหม่',
      newGroupBtn: 'เพิ่มห้องเรียนหรือกลุ่ม VIP',
      groupType: 'ประเภท',
      typeClass: 'ห้องเรียน',
      typeVip: 'VIP',
      code: 'รหัส',
      codeHint: 'ชื่อย่อที่แสดงบนที่นั่ง เช่น 7A หรือ VIP-B (แก้ไขภายหลังไม่ได้)',
      groupName: 'ชื่อเต็ม',
      color: 'สี',
      customColor: 'เลือกสีเอง',
      delete: 'ลบ',
      noneYet: 'ยังไม่มี',
      groupCount: (n) => `${n} กลุ่ม`,
      groupSaved: (n) => `บันทึก “${n}” แล้ว`,
      confirmDeleteGroup: (n) => `ลบ “${n}” ใช่หรือไม่? ที่นั่งที่จัดไว้แล้วจะยังคงสีเดิม`,
      vipGuests: 'แขก VIP',
      vipSeat: 'ที่นั่ง VIP',
      vipHint: 'หากต้องการจัดที่นั่งให้แขก VIP ให้เปิดผังที่นั่ง คลิกที่นั่ง แล้วเลือกกลุ่ม VIP',
      vipHintShort: 'คลิกที่นั่งแล้วเลือกกลุ่ม VIP เพื่อจัดที่นั่งให้แขก',
      noVips: 'ยังไม่มีที่นั่ง VIP',
      brand: 'CAMC Seating',
      navEvents: 'งานทั้งหมด',
      navTeacher: 'เข้าสู่ระบบครู',
      navTeacherShort: 'เข้าสู่ระบบ',
      heroEyebrow: 'ผังที่นั่งหอประชุม',
      heroTitle: 'ค้นหาที่นั่งของคุณ',
      heroSub: 'ค้นหางานเพื่อดูว่าแต่ละห้องเรียนและแขกนั่งอยู่ตรงไหน',
      searchEvents: 'ค้นหางาน',
      noEvents: 'ยังไม่มีงานที่เผยแพร่',
      noEventsMatch: 'ไม่พบงานที่ค้นหา',
      seatsAssigned: 'ที่นั่งที่จัดแล้ว',
      updated: 'อัปเดต',
      by: 'โดย',
      allEvents: 'งานทั้งหมด',
      findInChart: 'ค้นหาห้อง ชื่อ หรือเลขที่นั่ง',
      results: (n) => `พบ ${n} ที่นั่ง`,
      noResults: 'ไม่พบที่นั่ง',
      labelsNumbers: 'เลขที่นั่ง',
      labelsClasses: 'ห้องเรียน',
      print: 'พิมพ์',
      totalSeats: 'ความจุ',
      allocated: 'จัดแล้ว',
      remaining: 'ว่าง',
      occupancy: 'อัตราการใช้',
      classesHere: 'ห้องเรียนในงานนี้',
      seat: 'ที่นั่ง',
      available: 'ว่าง',
      stage: 'เวที',
      mainAisle: 'ทางเดินหลัก',
      booth: 'ห้องควบคุม',
      balconyL: 'ระเบียงซ้าย',
      balconyR: 'ระเบียงขวา',
      extraSeats: 'เก้าอี้เสริม',
      zoom: 'ขนาด',
      eventNotFound: 'ไม่พบงานนี้',
      loadError: 'เกิดข้อผิดพลาด กรุณาลองใหม่',
      signInTitle: 'เข้าสู่ระบบ CAMC Seating',
      signInSub: 'สำหรับครูและผู้ดูแลระบบ',
      username: 'ชื่อผู้ใช้',
      password: 'รหัสผ่าน',
      signIn: 'เข้าสู่ระบบ',
      signOut: 'ออกจากระบบ',
      changePassword: 'เปลี่ยนรหัสผ่าน',
      currentPassword: 'รหัสผ่านปัจจุบัน',
      newPassword: 'รหัสผ่านใหม่',
      backToViewer: 'ดูผังที่นั่งสาธารณะ',
      myEvents: 'ผังที่นั่ง',
      myEventsSub: 'สร้างและแก้ไขผังที่นั่งของแต่ละงาน',
      newEvent: 'สร้างงานใหม่',
      newEventPrompt: 'ชื่องาน',
      eventDate: 'วันที่',
      create: 'สร้าง',
      cancel: 'ยกเลิก',
      save: 'บันทึก',
      saved: 'บันทึกแล้ว',
      saving: 'กำลังบันทึก…',
      unsaved: 'ยังไม่ได้บันทึก',
      undo: 'ย้อนกลับ',
      close: 'ปิด',
      done: 'เสร็จสิ้น',
      autoAllocate: 'จัดที่นั่งอัตโนมัติ',
      autoAllocateSub: 'เติมที่นั่งว่างให้ห้องเรียนตามทิศทางที่เลือก',
      class: 'ห้องเรียน',
      count: 'จำนวนคน',
      direction: 'ทิศทาง',
      buffer: 'เว้นว่าง 1 ที่ก่อนกลุ่มนี้',
      allocate: 'จัดที่นั่ง',
      dirH1: 'แนวนอนทีละแถว · เลข 1 → 29',
      dirH2: 'แนวนอนทีละแถว · เลข 29 → 1',
      dirV1: 'แนวตั้งตามโซน · โซนขวาก่อน (1–7)',
      dirV2: 'แนวตั้งตามโซน · โซนกลางก่อน (8–22)',
      dirV3: 'แนวตั้งตามโซน · โซนซ้ายก่อน (23–29)',
      addSeats: 'เก้าอี้เสริม',
      addSeatsSub: 'กดปุ่ม + บนผังเพื่อเพิ่มเก้าอี้ที่ระเบียง ทางเดิน และท้ายหอประชุม',
      eventSettings: 'งาน',
      exportJson: 'ส่งออก JSON',
      importJson: 'นำเข้า JSON',
      clearAll: 'ล้างที่นั่งทั้งหมด',
      deleteEvent: 'ลบงานนี้',
      viewPublic: 'ดูหน้าสาธารณะ',
      editSeat: 'ที่นั่ง',
      personName: 'ชื่อบุคคล (ไม่บังคับ)',
      personPlaceholder: 'เช่น ประธานในพิธี',
      photo: 'รูปถ่าย (ไม่บังคับ)',
      choosePhoto: 'เลือกรูป',
      removePhoto: 'ลบรูป',
      clearSeat: 'ล้างที่นั่ง',
      removeSeat: 'ลบเก้าอี้',
      notEnough: (n) => `ที่นั่งว่างไม่พอ เหลือ ${n} ที่`,
      invalidCount: 'กรุณาระบุจำนวนคน',
      confirmDelete: (n) => `ลบ “${n}” ใช่หรือไม่? ไม่สามารถกู้คืนได้`,
      confirmClear: 'ล้างที่นั่งทั้งหมดในงานนี้ใช่หรือไม่?',
      confirmRemoveSeat: (s) => `ลบเก้าอี้ ${s} ออกจากผังใช่หรือไม่?`,
      confirmLeave: 'มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก ออกโดยไม่บันทึกใช่หรือไม่?',
      importDone: (n) => `นำเข้า “${n}” แล้ว อย่าลืมกดบันทึก`,
      importBad: 'ไฟล์นี้ไม่ใช่ผังที่นั่งที่ถูกต้อง',
      emptyEvents: 'ยังไม่มีผังที่นั่ง สร้างงานแรกเพื่อเริ่มต้น',
      adminTitle: 'บัญชีครู',
      adminSub: 'สร้างบัญชีให้ครูเข้าสู่ระบบเพื่อจัดการผังที่นั่ง',
      newTeacher: 'บัญชีครูใหม่',
      fullName: 'ชื่อ-นามสกุล',
      createAccount: 'สร้างบัญชี',
      teachers: 'ครู',
      noTeachers: 'ยังไม่มีบัญชีครู',
      accountCreated: (u) => `สร้างบัญชี “${u}” แล้ว`,
      created: 'สร้างเมื่อ',
      passwordChanged: 'เปลี่ยนรหัสผ่านแล้ว',
      admin: 'ผู้ดูแลระบบ',
      teacher: 'ครู',
    },
  };

  let lang = 'en';
  try {
    lang = localStorage.getItem('camc_lang') || ((navigator.language || '').startsWith('th') ? 'th' : 'en');
  } catch {
    lang = (navigator.language || '').startsWith('th') ? 'th' : 'en';
  }

  const listeners = [];

  function t(key, ...args) {
    const v = (STRINGS[lang] && STRINGS[lang][key]) ?? STRINGS.en[key] ?? key;
    return typeof v === 'function' ? v(...args) : v;
  }

  function applyI18n(root = document) {
    document.documentElement.lang = lang;
    root.querySelectorAll('[data-i18n]').forEach((n) => (n.textContent = t(n.dataset.i18n)));
    root.querySelectorAll('[data-i18n-placeholder]').forEach((n) => (n.placeholder = t(n.dataset.i18nPlaceholder)));
    root.querySelectorAll('[data-i18n-aria]').forEach((n) => n.setAttribute('aria-label', t(n.dataset.i18nAria)));
    root.querySelectorAll('.lang-toggle').forEach((b) => (b.textContent = lang === 'th' ? 'EN' : 'ไทย'));
  }

  function setLang(next) {
    lang = next;
    try { localStorage.setItem('camc_lang', lang); } catch { /* ignore */ }
    applyI18n();
    listeners.forEach((fn) => fn(lang));
  }

  function onLangChange(fn) { listeners.push(fn); }

  document.addEventListener('click', (e) => {
    if (e.target.closest('.lang-toggle')) setLang(lang === 'th' ? 'en' : 'th');
  });

  async function api(path, options = {}) {
    const opts = { credentials: 'same-origin', ...options, headers: { ...(options.headers || {}) } };
    if (opts.body && typeof opts.body !== 'string') {
      opts.body = JSON.stringify(opts.body);
      opts.headers['Content-Type'] = 'application/json';
    } else if (opts.method && opts.method !== 'GET') {
      opts.headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(path, opts);
    let data = {};
    try { data = await res.json(); } catch { /* no body */ }
    if (!res.ok) {
      const err = new Error(data.error || t('loadError'));
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function formatDate(iso, withTime) {
    if (!iso) return '';
    const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
    if (isNaN(d)) return iso;
    const opts = withTime
      ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { day: 'numeric', month: 'long', year: 'numeric' };
    return d.toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', opts);
  }

  let toastTimer;
  function toast(msg, kind) {
    let n = document.getElementById('toast');
    if (!n) {
      n = document.createElement('div');
      n.id = 'toast';
      n.className = 'toast';
      n.setAttribute('role', 'status');
      document.body.appendChild(n);
    }
    n.textContent = msg;
    n.dataset.kind = kind || '';
    n.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => n.classList.remove('show'), 3200);
  }

  function debounce(fn, ms) {
    let id;
    return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
  }

  window.CAMC = { t, applyI18n, setLang, onLangChange, getLang: () => lang, api, formatDate, toast, debounce };
})();
