'use strict';
(() => {
  const el=id=>document.getElementById(id);
  let lang='kk', setup=false, ownerEmail='',busy=false;
  const t=(kk,ru)=>lang==='kk'?kk:ru;
  const messages={
    invalid_credentials:['Email немесе құпиясөз дұрыс емес.','Неверный email или пароль.'],
    password_length:['Құпиясөз 15–128 таңбадан тұруы керек.','Пароль должен содержать 15–128 символов.'],
    owner_email_required:['Осы ChatGPT аккаунтының email-ын қолдан.','Используй email этого аккаунта ChatGPT.'],
    too_many_attempts:['Тым көп әрекет. 15 минуттан кейін қайталап көр.','Слишком много попыток. Повтори через 15 минут.'],
    already_configured:['Құпиясөз орнатылған. Бетті жаңартып, кір.','Пароль уже установлен. Обнови страницу и войди.'],
    platform_signin_required:['Жеке демоға өз ChatGPT аккаунтыңмен қайта кір.','Снова открой частное демо через свой аккаунт ChatGPT.'],
    mismatch:['Құпиясөздер сәйкес келмейді.','Пароли не совпадают.'],
    service_unavailable:['Қазір қосылу мүмкін болмады. Қайта көр.','Не удалось подключиться. Попробуй ещё раз.']
  };
  function paint(){
    document.documentElement.lang=lang;
    document.title='N&D · '+t('Кіру','Вход');
    document.querySelectorAll('[data-lang]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lang===lang)));
    el('private-label').textContent=t('Жеке демо','Частное демо');
    el('intro-title').innerHTML=t('Университетің.<br>Бір кеңістікте.','Твой университет.<br>В одном месте.');
    el('intro-copy').textContent=t('Сабақ кестесі, тапсырмалар мен университет өмірі — N&D-де.','Расписание, задания и жизнь университета — в N&D.');
    el('preview-title').textContent=t('Өз кеңістігіңе орал','Возвращайся в своё пространство');
    el('preview-copy').textContent=t('Кесте · Бағалар · Кампус','Расписание · Оценки · Кампус');
    el('card-tag').textContent=t('N&D АККАУНТЫ','АККАУНТ N&D');
    el('form-title').textContent=setup?t('Қош келдің','Добро пожаловать'):t('Қайта оралуыңмен','С возвращением');
    el('form-subtitle').textContent=setup?t('Жеке демоңа кіру үшін құпиясөз орнат. Email — осы ChatGPT аккаунтыңдікі.','Задай пароль для входа в частное демо. Email — от твоего аккаунта ChatGPT.'):t('Жалғастыру үшін email мен құпиясөзіңді енгіз.','Введи email и пароль, чтобы продолжить.');
    el('password-label').textContent=t('Құпиясөз','Пароль');
    el('confirm-label').textContent=t('Құпиясөзді қайтала','Повтори пароль');
    el('password-hint').textContent=t('Кемінде 15 таңба. Құпиясөзді сақтап қой: қалпына келтіру әзірге қосылмаған.','Минимум 15 символов. Сохрани пароль: восстановление пока не подключено.');
    el('private-note').textContent=t('Жеке демоға тек өз аккаунтыңмен кіресің.','В частное демо можно войти только со своим аккаунтом.');
    el('footer-label').textContent=t('Сенің университет кеңістігің','Твоё университетское пространство');
    el('retry').textContent=t('Қайталау','Повторить');
    el('confirm-field').hidden=!setup;el('confirm').required=setup;el('password-hint').hidden=!setup;
    el('password').minLength=setup?15:1;el('password').autocomplete=setup?'new-password':'current-password';
    el('submit').innerHTML=(busy?t('Күте тұр…','Подожди…'):setup?t('Құпиясөз орнату','Задать пароль'):t('Кіру','Войти'))+' <span aria-hidden="true">↗</span>';
    el('show-password').setAttribute('aria-label',el('password').type==='password'?t('Құпиясөзді көрсету','Показать пароль'):t('Құпиясөзді жасыру','Скрыть пароль'));
  }
  async function load(){
    el('loading-error').hidden=true;el('retry').hidden=true;
    try {
      const response=await fetch('/api/auth/status',{cache:'no-store'});
      const data=await response.json();if(!response.ok)throw data;
      if(data.authenticated){location.replace('./');return;}
      setup=data.needsSetup;ownerEmail=data.email;el('email').value=ownerEmail;
      paint();el('auth-form').hidden=false;
    }catch(e){el('form-subtitle').textContent=t('Кіруді бастау мүмкін болмады.','Не удалось загрузить вход.');el('loading-error').textContent=t(...(messages[e.error]||messages.service_unavailable));el('loading-error').hidden=false;el('retry').hidden=false;}
  }
  document.querySelectorAll('[data-lang]').forEach(b=>b.addEventListener('click',()=>{lang=b.dataset.lang;paint();}));
  el('show-password').addEventListener('click',()=>{const show=el('password').type==='password';el('password').type=show?'text':'password';el('show-password').setAttribute('aria-pressed',String(show));paint();});
  el('retry').addEventListener('click',load);
  el('auth-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    el('form-error').hidden=true;
    if(setup&&el('password').value!==el('confirm').value){el('form-error').textContent=t(...messages.mismatch);el('form-error').hidden=false;el('confirm').focus();return;}
    busy=true;el('submit').disabled=true;paint();
    try{
      const response=await fetch(setup?'/api/auth/setup':'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:ownerEmail,password:el('password').value})});
      const data=await response.json();if(!response.ok)throw data;
      el('password').value='';el('confirm').value='';location.replace('./');
    }catch(e){el('form-error').textContent=t(...(messages[e.error]||messages.service_unavailable));el('form-error').hidden=false;}
    finally{busy=false;el('submit').disabled=false;paint();}
  });
  load();
})();
