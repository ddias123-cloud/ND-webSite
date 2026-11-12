'use strict';
(() => {
  const el=id=>document.getElementById(id);
  const link=location.hash.match(/^#(verify|reset)\/([a-f0-9]{64})$/);
  let lang='kk',mode=link?link[1]:'login',busy=false,errorCode='',success='',canRegister=true,ownerOnly=false;
  try{const saved=localStorage.getItem('nd-auth-lang');if(['kk','ru'].includes(saved))lang=saved;}catch{}
  const t=(kk,ru)=>lang==='kk'?kk:ru;
  const messages={
    invalid_setup_code:['Жеке демо коды дұрыс емес.','Неверный код частного демо.'],
    setup_unavailable:['Бастапқы код Cloudflare-да әлі орнатылмаған.','Начальный код ещё не настроен в Cloudflare.'],
    setup_code_too_short:['Cloudflare-да сақталған код 24 таңбадан қысқа. ND_SETUP_CODE мәнін кемінде 24 таңбалық кодқа ауыстыр.','Сохранённый в Cloudflare код короче 24 символов. Замени значение ND_SETUP_CODE на код длиной не менее 24 символов.'],
    invalid_credentials:['Email немесе құпиясөз дұрыс емес.','Неверный email или пароль.'],
    invalid_email:['Дұрыс email енгіз: Gmail, Mail.ru немесе басқа пошта.','Введи корректный email: Gmail, Mail.ru или другую почту.'],
    password_length:['Құпиясөз 8–128 таңбадан тұруы керек.','Пароль должен содержать 8–128 символов.'],
    password_characters:['Құпиясөзде кемінде бір латын әрпі болуы керек. Латын әріптері, цифрлар мен белгілерді қолдан; бос орын мен кириллица жарамайды.','Нужна хотя бы одна английская буква. Можно использовать латинские буквы, цифры и знаки; кириллица и пробелы не допускаются.'],
    email_registered:['Бұл email тіркелген. «Кіру» батырмасын таңда.','Эта почта уже зарегистрирована. Переключись на «Вход».'],
    too_many_attempts:['Тым көп әрекет. 15 минуттан кейін қайталап көр.','Слишком много попыток. Повтори через 15 минут.'],
    platform_signin_required:['N&D аккаунтыңа қайта кір.','Снова войди в аккаунт N&D.'],
    mismatch:['Құпиясөздер сәйкес келмейді.','Пароли не совпадают.'],
    email_unavailable:['Хат жіберу сервисі әлі қосылмаған. Кейінірек қайталап көр.','Сервис отправки писем ещё не подключён. Попробуй позже.'],
    invalid_link:['Сілтеменің мерзімі өткен немесе ол қолданылған. Жаңасын сұрат.','Ссылка истекла или уже использована. Запроси новую.'],
    signin_required:['Алдымен аккаунтыңа кір.','Сначала войди в аккаунт.'],
    service_unavailable:['Қазір қосылу мүмкін болмады. Қайта көр.','Не удалось подключиться. Попробуй ещё раз.']
  };
  function paint(){
    if(!canRegister&&mode==='register')mode='login';
    const registering=mode==='register',resetting=mode==='reset',normal=['login','register'].includes(mode),passwordMode=normal||resetting;
    document.documentElement.lang=lang;
    document.title='N&D · '+(registering?t('Тіркелу','Регистрация'):t('Кіру','Вход'));
    document.querySelectorAll('[data-lang]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lang===lang)));
    document.querySelectorAll('[data-mode]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.mode===mode));b.disabled=busy;});
    document.querySelector('.auth-tabs').setAttribute('aria-label',t('Кіру немесе тіркелу','Вход или регистрация'));
    el('login-tab').textContent=t('Кіру','Вход');el('register-tab').textContent=t('Тіркелу','Регистрация');
    el('card-tag').textContent=t('N&D АККАУНТЫ','АККАУНТ N&D');
    const labels={login:[t('Қайта оралуыңмен','С возвращением'),t('Email мен құпиясөзіңді енгіз.','Введи свою почту и пароль.'),t('Кіру','Войти')],register:[t('Аккаунт жаса','Создай аккаунт'),t('Өз email-ыңды енгізіп, құпиясөз ойлап тап.','Укажи свою почту и придумай пароль.'),t('Тіркелу','Зарегистрироваться')],forgot:[t('Құпиясөзді қалпына келтіру','Восстановление пароля'),t('Аккаунтыңның email-ын енгіз.','Введи почту своего аккаунта.'),t('Сілтеме сұрату','Запросить ссылку')],reset:[t('Жаңа құпиясөз','Новый пароль'),t('Аккаунтың үшін жаңа құпиясөз орнат.','Задай новый пароль для своего аккаунта.'),t('Құпиясөзді сақтау','Сохранить пароль')],verify:[t('Email растау','Подтверждение почты'),t('Email мекенжайын растау үшін төмендегі батырманы бас.','Нажми кнопку ниже, чтобы подтвердить почту.'),t('Email растау','Подтвердить почту')]};
    el('form-title').textContent=labels[mode][0];el('form-subtitle').textContent=labels[mode][1];document.title='N&D · '+labels[mode][0];
    document.querySelector('.auth-tabs').hidden=!normal||!canRegister;
    el('setup-field').hidden=!(ownerOnly&&registering);el('setup-code').required=ownerOnly&&registering;
    el('setup-label').textContent=t('Жеке демо коды','Код частного демо');el('setup-hint').textContent=t('Cloudflare-да өзің орнатқан бастапқы код. Тек алғашқы тіркелуге керек.','Начальный код, который ты задал в Cloudflare. Нужен только при первой регистрации.');
    el('email').hidden=!normal&&mode!=='forgot';el('email-label').hidden=el('email').hidden;el('email').required=!el('email').hidden;
    el('password-label').hidden=!passwordMode;document.querySelector('.password-field').hidden=!passwordMode;el('password').required=passwordMode;
    el('forgot-link').hidden=mode!=='login';el('back-login').hidden=normal;
    el('forgot-link').textContent=t('Құпиясөзді ұмыттың ба?','Забыли пароль?');el('back-login').textContent=t('Кіруге оралу','Вернуться ко входу');
    el('password-label').textContent=t('Құпиясөз','Пароль');
    el('confirm-label').textContent=t('Құпиясөзді қайтала','Повтори пароль');
    el('password-hint').textContent=t('8–128 таңба және кемінде бір латын әрпі. Цифрлар мен белгілер болады; бос орын мен кириллица болмайды.','8–128 символов и хотя бы одна английская буква. Допустимы цифры и знаки, без пробелов и кириллицы.');
    el('private-note').textContent=t('N&D аккаунтыңмен сайтқа да, веб-қосымшаға да кіре аласың.','Один аккаунт N&D для сайта и веб-приложения.');
    el('footer-label').textContent=t('Сенің университет кеңістігің','Твоё университетское пространство');
    el('retry').textContent=t('Қайталау','Повторить');
    el('confirm-field').hidden=!(registering||resetting);el('confirm').required=registering||resetting;el('password-hint').hidden=!(registering||resetting);
    el('password').minLength=registering||resetting?8:1;el('password').autocomplete=registering||resetting?'new-password':'current-password';
    el('password').setAttribute('aria-describedby',registering?'password-hint':'password-label');
    el('submit').innerHTML=(busy?t('Күте тұр…','Подожди…'):labels[mode][2])+' <span aria-hidden="true">↗</span>';
    el('form-success').hidden=!success;el('form-success').textContent=success;
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
      canRegister=data.canRegister!==false;ownerOnly=!!data.ownerOnly;
      if(data.authenticated&&['login','register'].includes(mode)){location.replace('./');return;}
      paint();el('auth-form').hidden=false;
    }catch(e){el('form-subtitle').textContent=t('Кіруді бастау мүмкін болмады.','Не удалось загрузить вход.');el('loading-error').textContent=t(...(messages[e.error]||messages.service_unavailable));el('loading-error').hidden=false;el('retry').hidden=false;}
  }
  document.querySelectorAll('[data-lang]').forEach(b=>b.addEventListener('click',()=>{lang=b.dataset.lang;try{localStorage.setItem('nd-auth-lang',lang);}catch{}paint();}));
  function changeMode(value){if(busy)return;mode=value;errorCode='';success='';el('password').value='';el('confirm').value='';el('setup-code').value='';paint();}
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>changeMode(b.dataset.mode)));
  el('forgot-link').addEventListener('click',()=>{changeMode('forgot');el('email').focus();});
  el('back-login').addEventListener('click',()=>{history.replaceState(null,'','/account');changeMode('login');});
  el('show-password').addEventListener('click',()=>{const show=el('password').type==='password';el('password').type=show?'text':'password';el('confirm').type=show?'text':'password';el('show-password').setAttribute('aria-pressed',String(show));paint();});
  el('retry').addEventListener('click',load);
  el('auth-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    errorCode='';success='';const registering=mode==='register',password=el('password').value;
    if(registering||mode==='reset'){
      if(password.length<8||password.length>128){showError('password_length');return;}
      if(!/[A-Za-z]/.test(password)||!/^[\x21-\x7e]+$/.test(password)){showError('password_characters');return;}
      if(password!==el('confirm').value){showError('mismatch');el('confirm').focus();return;}
    }
    busy=true;el('submit').disabled=true;paint();
    try{
      const response=await fetch('/api/auth/'+mode,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:el('email').value.trim(),password,setupCode:registering?el('setup-code').value:undefined,token:link?.[2]})});
      const data=await response.json();if(!response.ok)throw data;
      el('password').value='';el('confirm').value='';el('setup-code').value='';
      if(['login','register'].includes(mode)){location.replace('./');return;}
      if(mode==='forgot')success=t('Егер бұл email тіркелген болса және хат жеткізілсе, қалпына келтіру сілтемесін аласың. Спам бумасын да тексер.','Если почта зарегистрирована и письмо доставлено, ты получишь ссылку для восстановления. Проверь также папку «Спам».');
      else{success=mode==='reset'?t('Құпиясөз өзгертілді. Жаңа құпиясөзбен кір.','Пароль изменён. Войди с новым паролем.'):t('Email расталды. Университет кеңістігіне орала аласың.','Почта подтверждена. Можно вернуться в университетское пространство.');mode='login';history.replaceState(null,'','/account');}
    }catch(e){showError(e.error||'service_unavailable');}
    finally{busy=false;el('submit').disabled=false;paint();}
  });
  paint();load();
})();
