(function () {
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const botConfig = window.LEGION_BOT_CONFIG || {};
  const gasUrl = String(botConfig.gasUrl || "").trim();

  if (tg) {
    try {
      tg.ready();
      tg.expand();
      tg.setBackgroundColor("#eef4ff");
      tg.setHeaderColor("#eef4ff");
    } catch (error) {
      console.warn("Telegram WebApp init skipped:", error);
    }
  }

  const defaultTariffs = [
    { city: "Москва", auto: "280", electro: "230", velo: "210", foot: "190" },
    { city: "Санкт-Петербург", auto: "270", electro: "225", velo: "205", foot: "185" },
    { city: "Казань", auto: "250", electro: "210", velo: "195", foot: "" },
    { city: "Самара", auto: "245", electro: "", velo: "188", foot: "172" }
  ];

  const workTypeLabels = {
    auto: "Авто",
    electro: "Электро-вело",
    velo: "Вело",
    foot: "Пеший"
  };

  const tariffCitySelect = document.getElementById("tariffCitySelect");
  const tariffWorkTypeSelect = document.getElementById("tariffWorkTypeSelect");
  const tariffSummary = document.getElementById("tariffSummary");
  const tariffNote = document.getElementById("tariffNote");
  const tariffDataState = document.getElementById("tariffDataState");
  const registrationForm = document.getElementById("registrationForm");
  const registrationStatus = document.getElementById("registrationStatus");
  const candidateForm = document.getElementById("candidateForm");
  const candidateStatus = document.getElementById("candidateStatus");
  const navButtons = Array.from(document.querySelectorAll("[data-nav-target]"));

  function getTelegramUserMeta() {
    const user = tg && tg.initDataUnsafe ? tg.initDataUnsafe.user || null : null;
    return {
      telegramUserId: String(user?.id || "").trim(),
      telegramUsername: String(user?.username ? `@${user.username}` : "").trim(),
      chatId: ""
    };
  }

  function submitJsonp(action, params) {
    return new Promise((resolve, reject) => {
      if (!gasUrl) {
        reject(new Error("Не настроен gasUrl в config.js"));
        return;
      }

      const callbackName = `legionBotJsonp_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const script = document.createElement("script");
      const separator = gasUrl.includes("?") ? "&" : "?";
      const searchParams = new URLSearchParams({
        action,
        callback: callbackName,
        ...params
      });
      const timeoutId = window.setTimeout(() => {
        cleanup();
        reject(new Error("Истекло время ожидания ответа от bot Apps Script."));
      }, 20000);

      function cleanup() {
        window.clearTimeout(timeoutId);
        delete window[callbackName];
        script.remove();
      }

      window[callbackName] = (payload) => {
        cleanup();
        resolve(payload);
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("Не удалось обратиться к bot Apps Script."));
      };

      script.src = `${gasUrl}${separator}${searchParams.toString()}`;
      document.body.appendChild(script);
    });
  }

  function parseRubles(value) {
    const normalized = String(value || "")
      .replace(/\s+/g, "")
      .replace(",", ".")
      .match(/-?\d+(?:\.\d+)?/);

    if (!normalized) return null;
    return Number(normalized[0]);
  }

  function formatRubles(value) {
    if (!Number.isFinite(value)) return "Уточняется";
    return `${Math.round(value)} ₽`;
  }

  function getTariffs() {
    return Array.isArray(window.LEGION_BOT_TARIFFS) && window.LEGION_BOT_TARIFFS.length
      ? window.LEGION_BOT_TARIFFS
      : defaultTariffs;
  }

  function getAverageForCity(cityRow) {
    const values = ["auto", "electro", "velo", "foot"]
      .map((key) => parseRubles(cityRow[key]))
      .filter((value) => Number.isFinite(value));

    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function getBaseRate(cityRow, workTypeKey) {
    const exact = parseRubles(cityRow?.[workTypeKey]);
    if (Number.isFinite(exact)) {
      return { value: exact, source: "exact" };
    }

    const average = getAverageForCity(cityRow);
    if (Number.isFinite(average)) {
      return { value: average, source: "average" };
    }

    return { value: null, source: "missing" };
  }

  function renderTariffSummary() {
    const rows = getTariffs();
    const selectedCity = rows.find((row) => row.city === tariffCitySelect.value) || rows[0];
    const workTypeKey = tariffWorkTypeSelect.value;
    const baseRate = getBaseRate(selectedCity, workTypeKey);
    const distanceExample = Number.isFinite(baseRate.value) ? baseRate.value + 2 * 17 : null;
    const weightExample = Number.isFinite(baseRate.value) ? baseRate.value + 5 * 5 : null;
    const combinedExample = Number.isFinite(baseRate.value) ? baseRate.value + 2 * 17 + 5 * 5 : null;

    tariffSummary.innerHTML = `
      <article class="tariff-summary-item">
        <span>Фикс в вашем городе</span>
        <strong>${formatRubles(baseRate.value)}</strong>
      </article>
      <article class="tariff-summary-item">
        <span>Доплата за дальность</span>
        <strong>+17 ₽/км</strong>
      </article>
      <article class="tariff-summary-item">
        <span>Доплата за перевес</span>
        <strong>+5 ₽/кг</strong>
      </article>
      <article class="tariff-summary-item">
        <span>Пример расчёта</span>
        <strong>${formatRubles(combinedExample)}</strong>
      </article>
    `;

    if (baseRate.source === "exact") {
      tariffNote.textContent = `Для города «${selectedCity.city}» и формата «${workTypeLabels[workTypeKey]}» показываем фикс по справочнику. Пример выше учитывает заказ на 5 км и перевес 35 кг.`;
    } else if (baseRate.source === "average") {
      tariffNote.textContent = `Для города «${selectedCity.city}» точного фикса для формата «${workTypeLabels[workTypeKey]}» пока нет, поэтому показываем среднюю ставку по доступным форматам в этом городе.`;
    } else {
      tariffNote.textContent = "По выбранному городу ставка пока уточняется. Оставьте заявку, и менеджер даст актуальные условия.";
    }
  }

  function fillCityOptions() {
    const rows = getTariffs();
    tariffCitySelect.innerHTML = rows
      .map((row) => `<option value="${row.city}">${row.city}</option>`)
      .join("");
    tariffDataState.textContent = rows === defaultTariffs ? "Тестовые тарифы" : "Тарифы из CRM";
  }

  function scrollToSection(id) {
    const element = document.getElementById(id);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  fillCityOptions();
  renderTariffSummary();

  tariffCitySelect.addEventListener("change", renderTariffSummary);
  tariffWorkTypeSelect.addEventListener("change", renderTariffSummary);

  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      scrollToSection(button.dataset.navTarget || "");
    });
  });

  registrationForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const fullName = document.getElementById("registrationFullName").value.trim();
    const phone = document.getElementById("registrationPhone").value.trim();

    if (!fullName || !phone) {
      registrationStatus.textContent = "Заполни ФИО и телефон, чтобы отправить заявку на доступ.";
      return;
    }

    registrationStatus.textContent = "Отправляю заявку на доступ...";

    const userMeta = getTelegramUserMeta();

    submitJsonp("submitRegistration", {
      fullName,
      phone,
      telegramUserId: userMeta.telegramUserId,
      telegramUsername: userMeta.telegramUsername,
      chatId: userMeta.chatId
    }).then((payload) => {
      if (!payload?.ok) {
        throw new Error(payload?.error || "Не удалось отправить заявку.");
      }

      if (tg && tg.HapticFeedback && tg.HapticFeedback.notificationOccurred) {
        tg.HapticFeedback.notificationOccurred("success");
      }

      registrationStatus.textContent = `Заявка отправлена. ID: ${payload.requestId || "—"}. После проверки менеджер откроет доступ к кабинету.`;
      registrationForm.reset();
    }).catch((error) => {
      registrationStatus.textContent = error.message || "Не удалось отправить заявку на доступ.";
    });
  });

  candidateForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const fullName = document.getElementById("candidateFullName").value.trim();
    const phone = document.getElementById("candidatePhone").value.trim();
    const city = document.getElementById("candidateCity").value.trim();
    const workType = document.getElementById("candidateWorkType").value.trim();

    if (!fullName || !phone) {
      candidateStatus.textContent = "Заполни хотя бы ФИО и телефон, чтобы оставить заявку.";
      return;
    }

    candidateStatus.textContent = "Отправляю заявку кандидата...";

    submitJsonp("submitCandidateLead", {
      fullName,
      phone,
      city,
      workType
    }).then((payload) => {
      if (!payload?.ok) {
        throw new Error(payload?.error || "Не удалось отправить заявку кандидата.");
      }

      if (tg && tg.HapticFeedback && tg.HapticFeedback.notificationOccurred) {
        tg.HapticFeedback.notificationOccurred("success");
      }

      candidateStatus.textContent = `Заявка отправлена. ID: ${payload.leadId || "—"}. Менеджер сможет увидеть её в CRM.`;
      candidateForm.reset();
    }).catch((error) => {
      candidateStatus.textContent = error.message || "Не удалось отправить заявку кандидата.";
    });
  });
})();
