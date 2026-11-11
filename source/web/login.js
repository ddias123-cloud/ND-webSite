'use strict';
(() => {
  const el=id=>document.getElementById(id);
  let lang='kk',mode='login',busy=false,errorCode='';
  try{const saved=localStorage.getItem('nd-auth-lang');if(['kk','ru'].includes(saved))lang=saved;}catch{}
  const t=(kk,ru)=>lang==='kk'?kk:ru;
  const messages={
    invalid_credentials:['Email немесе құпиясөз дұрыс емес.','Неверный email или пароль.'],
    invalid_email:['Дұрыс email енгіз: Gmail, Mail.ru немесе басқа пошта.','Введи корректный email: Gmail, Mail.ru или другую почту.'],
    password_length:['Құпиясөз 8–128 таңбадан тұруы керек.','Пароль должен содержать 8–128 символов.'],
    password_characters:['Құпиясөзде кемінде бір латын әрпі болуы керек. Латын әріптері, цифрлар мен белгілерді қолдан; бос орын мен кириллица жарамайды.','Нужна хотя бы одна английская буква. Можно использовать латинские буквы, цифры и знаки; кириллица и пробелы не допускаются.'],
    email_registered:['Бұл email тіркелген. «Кіру» батырмасын таңда.','Эта почта уже зарегистрирована. Переключись на «Вход».'],
    too_many_attempts:['Тым көп әрекет. 15 минуттан кейін қайталап көр.','Слишком много попыток. Повтори через 15 минут.'],
    platform_signin_required:['Жеке демоға өз ChatGPT аккаунтыңмен қайта кір.','Снова открой частное демо через свой аккаунт ChatGPT.'],
    mismatch:['Құпиясөздер сәйкес келмейді.','Пароли не совпадают.'],
    service_unavailable:['Қазір қосылу мүмкін болмады. Қайта көр.','Не удалось подключиться. Попробуй ещё раз.']
  };
  function paint(){
    const registering=mode==='register';
    document.documentElement.lang=lang;
    document.title='N&D · '+(registering?t('Тіркелу','Регистрация'):t('Кіру','Вход'));
    document.querySelectorAll('[data-lang]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lang===lang)));
    document.querySelectorAll('[data-mode]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.mode===mode));b.disabled=busy;});
    document.querySelector('.auth-tabs').setAttribute('aria-label',t('Кіру немесе тіркелу','Вход или регистрация'));
    el('login-tab').textContent=t('Кіру','Вход');el('register-tab').textContent=t('Тіркелу','Регистрация');
    el('private-label').textContent=t('Жеке демо','Частное демо');
    el('intro-title').innerHTML=t('Университетің.<br>Бір кеңістікте.','Твой университет.<br>В одном месте.');
    el('intro-copy').textContent=t('Сабақ кестесі, тапсырмалар мен университет өмірі — N&D-де.','Расписание, задания и жизнь университета — в N&D.');
    el('preview-title').textContent=t('Өз кеңістігіңе орал','Возвращайся в своё пространство');
    el('preview-copy').textContent=t('Кесте · Бағалар · Кампус','Расписание · Оценки · Кампус');
    el('card-tag').textContent=t('N&D АККАУНТЫ','АККАУНТ N&D');
    el('form-title').textContent=registering?t('Аккаунт жаса','Создай аккаунт'):t('Қайта оралуыңмен','С возвращением');
    el('form-subtitle').textContent=registering?t('Өз email-ыңды енгізіп, N&D үшін құпиясөз ойлап тап.','Укажи свою почту и придумай пароль для N&D.'):t('Жалғастыру үшін email мен құпиясөзіңді енгіз.','Введи свою почту и пароль, чтобы продолжить.');
    el('password-label').textContent=t('Құпиясөз','Пароль');
    el('confirm-label').textContent=t('Құпиясөзді қайтала','Повтори пароль');
    el('password-hint').textContent=t('8–128 таңба және кемінде бір латын әрпі. Цифрлар мен белгілер болады; бос орын мен кириллица болмайды.','8–128 символов и хотя бы одна английская буква. Допустимы цифры и знаки, без пробелов и кириллицы.');
    el('private-note').textContent=t('N&D аккаунтыңмен сайтқа да, веб-қосымшаға да кіре аласың.','Один аккаунт N&D для сайта и веб-приложения.');
    el('footer-label').textContent=t('Сенің университет кеңістігің','Твоё университетское пространство');
    el('retry').textContent=t('Қайталау','Повторить');
    el('confirm-field').hidden=!registering;el('confirm').required=registering;el('password-hint').hidden=!registering;
    el('password').minLength=registering?8:1;el('password').autocomplete=registering?'new-password':'current-password';
    el('password').setAttribute('aria-describedby',registering?'password-hint':'password-label');
    el('submit').innerHTML=(busy?t('Күте тұр…','Подожди…'):registering?t('Тіркелу','Зарегистрироваться'):t('Кіру','Войти'))+' <span aria-hidden="true">↗</span>';
    el('show-password').setAttribute('aria-label',el('password').type==='password'?t('Құпиясөзді көрсету','Показать пароль'):t('Құпиясөзді жасыру','Скрыть пароль'));
    el('form-error').hidden=!errorCode;
    if(errorCode)el('form-error').textContent=t(...(messages[errorCode]||messages.service_unavailable));
  }
  function showError(code){errorCode=code;paint();}
  async function load(){
    el('loading-error').hidden=true;el('retry').hidden=true;
    try {
      const response=await fetch('/api/auth/status',{cache:'no-store'});
      const data=await response.json();if(!response.ok)throw data;
      if(data.authenticated){location.replace('./');return;}
      paint();el('auth-form').hidden=false;
    }catch(e){el('form-subtitle').textContent=t('Кіруді бастау мүмкін болмады.','Не удалось загрузить вход.');el('loading-error').textContent=t(...(messages[e.error]||messages.service_unavailable));el('loading-error').hidden=false;el('retry').hidden=false;}
  }
  document.querySelectorAll('[data-lang]').forEach(b=>b.addEventListener('click',()=>{lang=b.dataset.lang;try{localStorage.setItem('nd-auth-lang',lang);}catch{}paint();}));
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{if(busy||mode===b.dataset.mode)return;mode=b.dataset.mode;errorCode='';el('password').value='';el('confirm').value='';paint();}));
  el('show-password').addEventListener('click',()=>{const show=el('password').type==='password';el('password').type=show?'text':'password';el('confirm').type=show?'text':'password';el('show-password').setAttribute('aria-pressed',String(show));paint();});
  el('retry').addEventListener('click',load);
  el('auth-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    errorCode='';const registering=mode==='register',password=el('password').value;
    if(registering){
      if(password.length<8||password.length>128){showError('password_length');return;}
      if(!/[A-Za-z]/.test(password)||!/^[\x21-\x7e]+$/.test(password)){showError('password_characters');return;}
      if(password!==el('confirm').value){showError('mismatch');el('confirm').focus();return;}
    }
    busy=true;el('submit').disabled=true;paint();
    try{
      const response=await fetch(registering?'/api/auth/register':'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:el('email').value.trim(),password})});
      const data=await response.json();if(!response.ok)throw data;
      el('password').value='';el('confirm').value='';location.replace('./');
    }catch(e){showError(e.error||'service_unavailable');}
    finally{busy=false;el('submit').disabled=false;paint();}
  });
  paint();load();
})();
