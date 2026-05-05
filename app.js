(function () {
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const botConfig = window.LEGION_BOT_CONFIG || {};
  const gasUrl = String(botConfig.gasUrl || "").trim();

  if (tg) {
    try {
      tg.ready();
      tg.expand();
      tg.setBackgroundColor("#121831");
      tg.setHeaderColor("#121831");
    } catch (error) {
      console.warn("Telegram WebApp init skipped:", error);
    }
  }

  const dom = {
    loadingView: document.getElementById("loadingView"),
    loadingTitle: document.getElementById("loadingTitle"),
    loadingSubtitle: document.getElementById("loadingSubtitle"),
    guestView: document.getElementById("guestView"),
    guestTitle: document.getElementById("guestTitle"),
    guestText: document.getElementById("guestText"),
    approvedView: document.getElementById("approvedView"),
    openCourierTab: document.getElementById("openCourierTab"),
    openCandidateTab: document.getElementById("openCandidateTab"),
    courierGuestPanel: document.getElementById("courierGuestPanel"),
    candidateGuestPanel: document.getElementById("candidateGuestPanel"),
    registrationForm: document.getElementById("registrationForm"),
    candidateForm: document.getElementById("candidateForm"),
    registrationStatus: document.getElementById("registrationStatus"),
    candidateStatus: document.getElementById("candidateStatus"),
    homeCourierInitials: document.getElementById("homeCourierInitials"),
    homeCourierName: document.getElementById("homeCourierName"),
    homeCourierBadge: document.getElementById("homeCourierBadge"),
    homeNewsRow: document.getElementById("homeNewsRow"),
    homeIncome: document.getElementById("homeIncome"),
    homeOrders: document.getElementById("homeOrders"),
    homeFailures: document.getElementById("homeFailures"),
    homeNotificationsMeta: document.getElementById("homeNotificationsMeta"),
    openNotificationsCard: document.getElementById("openNotificationsCard"),
    sheetBackdrop: document.getElementById("sheetBackdrop"),
    infoSheet: document.getElementById("infoSheet"),
    sheetTitle: document.getElementById("sheetTitle"),
    sheetBody: document.getElementById("sheetBody"),
    closeSheetButton: document.getElementById("closeSheetButton")
  };

  let currentHomePayload = null;

  function setVisible(element, visible) {
    if (!element) return;
    element.classList.toggle("is-hidden", !visible);
  }

  function setLoadingState(title, subtitle) {
    if (dom.loadingTitle) dom.loadingTitle.textContent = title;
    if (dom.loadingSubtitle) dom.loadingSubtitle.textContent = subtitle;
    setVisible(dom.loadingView, true);
    setVisible(dom.guestView, false);
    setVisible(dom.approvedView, false);
  }

  function getTelegramUserMeta() {
    const user = tg && tg.initDataUnsafe ? tg.initDataUnsafe.user || null : null;
    return {
      telegramUserId: String(user?.id || "").trim(),
      telegramUsername: String(user?.username ? `@${user.username}` : "").trim(),
      chatId: ""
    };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function submitJsonp(action, params = {}) {
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
    const parsed = parseRubles(value);
    if (!Number.isFinite(parsed)) return "0 ₽";
    return `${Math.round(parsed).toLocaleString("ru-RU")} ₽`;
  }

  function getInitials(fullName) {
    const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
    return (parts[0]?.[0] || "L") + (parts[1]?.[0] || "");
  }

  function showSheet(title, html) {
    dom.sheetTitle.textContent = title;
    dom.sheetBody.innerHTML = html;
    setVisible(dom.sheetBackdrop, true);
    setVisible(dom.infoSheet, true);
  }

  function closeSheet() {
    setVisible(dom.sheetBackdrop, false);
    setVisible(dom.infoSheet, false);
  }

  function openPlaceholderSheet(title, text) {
    showSheet(title, `<p>${escapeHtml(text)}</p>`);
  }

  function normalizeHomePayload(payload) {
    if (!payload?.ok || !payload.home) return null;
    return payload.home;
  }

  function renderNews(newsItems) {
    const fallbackNews = [
      { title: "Ваши итоги", subtitle: "Появится ручная новость из CRM", type: "system" },
      { title: "Качество работы", subtitle: "Здесь можно публиковать важные обновления", type: "system" },
      { title: "Срыв и обновления", subtitle: "Служебные новости и предупреждения", type: "warning" }
    ];

    const items = Array.isArray(newsItems) && newsItems.length ? newsItems.slice(0, 4) : fallbackNews;
    dom.homeNewsRow.innerHTML = items.map((item) => `
      <article class="news-card" data-type="${escapeHtml(item.type || "system")}" data-news-id="${escapeHtml(item.id || "")}">
        <span class="news-card-type">${escapeHtml(item.typeLabel || item.type || "Новость")}</span>
        <p class="news-card-title">${escapeHtml(item.title || "Новость")}</p>
        <p class="news-card-subtitle">${escapeHtml(item.subtitle || "Карточка новости из CRM")}</p>
      </article>
    `).join("");
  }

  function renderHome(home) {
    currentHomePayload = home;
    const courier = home.courier || {};
    const dashboard = home.dashboard || {};

    dom.homeCourierInitials.textContent = getInitials(courier.fullName);
    dom.homeCourierName.textContent = courier.fullName || "Курьер";
    dom.homeCourierBadge.textContent = courier.status || "Статус уточняется";
    dom.homeIncome.textContent = formatRubles(dashboard.totalIncome || dashboard.income || 0);
    dom.homeOrders.textContent = String(dashboard.totalOrders || dashboard.orders || 0);
    dom.homeFailures.textContent = `${dashboard.todayFailures || dashboard.totalFailures || 0}/${dashboard.failureLimit || 5}`;
    dom.homeNotificationsMeta.textContent = `Последнее обновление: ${home.generatedAtLabel || "сейчас"}`;
    renderNews(home.news || []);

    setVisible(dom.loadingView, false);
    setVisible(dom.guestView, false);
    setVisible(dom.approvedView, true);
  }

  function renderGuest(message, introText) {
    if (message) dom.registrationStatus.textContent = message;
    if (dom.guestTitle) dom.guestTitle.textContent = "Кабинет курьера";
    if (dom.guestText) {
      dom.guestText.textContent = introText || "Если вы уже в парке, выберите соответствующий вариант. Если вас не нашли, можно отправить заявку на доступ или оставить контакт как новый кандидат.";
    }
    setVisible(dom.loadingView, false);
    setVisible(dom.guestView, true);
    setVisible(dom.approvedView, false);
  }

  async function loadHome() {
    const userMeta = getTelegramUserMeta();
    setLoadingState("Загружаем профиль", "Проверяем, есть ли этот курьер в парке и открыт ли доступ в кабинет.");

    if (!userMeta.telegramUserId && !userMeta.telegramUsername) {
      renderGuest("Откройте mini app из Telegram-бота, чтобы система определила ваш доступ.");
      return;
    }

    try {
      const payload = await submitJsonp("getCourierHome", userMeta);
      const home = normalizeHomePayload(payload);

      if (home && home.accessState === "approved") {
        renderHome(home);
        return;
      }

      if (payload?.home?.accessState === "rejected" || payload?.home?.accessState === "blocked") {
        renderGuest("Доступ по этому Telegram-аккаунту не открыт. При необходимости отправьте новую заявку.");
        return;
      }

      renderGuest(
        "Простите, не нашли вас автоматически. Выберите, вы уже в парке или хотите подключиться как новый кандидат.",
        "Мы не нашли активную привязку к карточке курьера. Если вы уже работаете с парком, отправьте заявку на доступ. Если вы ещё не в парке, оставьте заявку на подключение."
      );
    } catch (error) {
      renderGuest(error.message || "Не удалось загрузить домашний экран.");
    }
  }

  function renderNotificationsSheet(notifications) {
    if (!notifications.length) {
      showSheet("Уведомления", `<p>Пока уведомлений нет. Когда в CRM зафиксируют срыв или важное сообщение, оно появится здесь.</p>`);
      return;
    }

    const html = `
      <div class="sheet-list">
        ${notifications.map((item) => {
          const type = String(item.type || "").trim().toLowerCase();
          const title = type === "failure_detected" ? "Зафиксирован срыв" : "Уведомление от парка";
          return `
            <article class="sheet-list-item ${type === "failure_detected" ? "is-failure" : ""}">
              <strong>${escapeHtml(title)}</strong>
              <p>${escapeHtml(item.message || "Новое уведомление")}</p>
              <p>${escapeHtml(item.created_at || item.sent_at || "")}</p>
            </article>
          `;
        }).join("")}
      </div>
    `;
    showSheet("Уведомления", html);
  }

  async function openNotifications() {
    const courierId = currentHomePayload?.courier?.id || currentHomePayload?.courierId || "";
    if (!courierId) {
      openPlaceholderSheet("Уведомления", "Кабинет ещё не загрузил ID курьера.");
      return;
    }

    try {
      const payload = await submitJsonp("getCourierNotifications", { courierId });
      renderNotificationsSheet(Array.isArray(payload?.notifications) ? payload.notifications : []);
    } catch (error) {
      openPlaceholderSheet("Уведомления", error.message || "Не удалось открыть уведомления.");
    }
  }

  function openWithdrawInfo() {
    showSheet("Вывод", `
      <p>Раздел вывода пока работает как информационное окно.</p>
      <p>Здесь будет короткая инструкция по выплатам, графику и статусу доступности вывода.</p>
      <p>Полный сценарий вывода добавим следующим этапом.</p>
    `);
  }

  function openNewsItem(newsId) {
    const news = Array.isArray(currentHomePayload?.news) ? currentHomePayload.news : [];
    const item = news.find((entry) => entry.id === newsId) || null;
    if (!item) return;

    showSheet(
      item.title || "Новость",
      `
        <p>${escapeHtml(item.subtitle || "")}</p>
        <p>${escapeHtml(item.body || "Полный текст новости пока не заполнен.")}</p>
      `
    );
  }

  function bindActions() {
    dom.openCourierTab.addEventListener("click", () => {
      dom.openCourierTab.classList.add("is-active");
      dom.openCandidateTab.classList.remove("is-active");
      setVisible(dom.courierGuestPanel, true);
      setVisible(dom.candidateGuestPanel, false);
    });

    dom.openCandidateTab.addEventListener("click", () => {
      dom.openCandidateTab.classList.add("is-active");
      dom.openCourierTab.classList.remove("is-active");
      setVisible(dom.courierGuestPanel, false);
      setVisible(dom.candidateGuestPanel, true);
    });

    dom.registrationForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const fullName = document.getElementById("registrationFullName").value.trim();
      const phone = document.getElementById("registrationPhone").value.trim();
      const userMeta = getTelegramUserMeta();

      if (!fullName || !phone) {
        dom.registrationStatus.textContent = "Заполните ФИО и телефон.";
        return;
      }

      dom.registrationStatus.textContent = "Отправляю заявку...";

      try {
        const payload = await submitJsonp("submitRegistration", {
          fullName,
          phone,
          telegramUserId: userMeta.telegramUserId,
          telegramUsername: userMeta.telegramUsername,
          chatId: userMeta.chatId
        });
        if (!payload?.ok) {
          throw new Error(payload?.error || "Не удалось отправить заявку.");
        }
        dom.registrationForm.reset();
        dom.registrationStatus.textContent = `Заявка отправлена. ID: ${payload.requestId || "—"}. После одобрения кабинет откроется автоматически.`;
      } catch (error) {
        dom.registrationStatus.textContent = error.message || "Не удалось отправить заявку.";
      }
    });

    dom.candidateForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const fullName = document.getElementById("candidateFullName").value.trim();
      const phone = document.getElementById("candidatePhone").value.trim();
      const city = document.getElementById("candidateCity").value.trim();
      const workType = document.getElementById("candidateWorkType").value.trim();

      if (!fullName || !phone) {
        dom.candidateStatus.textContent = "Заполните ФИО и телефон.";
        return;
      }

      dom.candidateStatus.textContent = "Отправляю заявку...";

      try {
        const payload = await submitJsonp("submitCandidateLead", { fullName, phone, city, workType });
        if (!payload?.ok) {
          throw new Error(payload?.error || "Не удалось отправить заявку.");
        }
        dom.candidateForm.reset();
        dom.candidateStatus.textContent = `Заявка отправлена. ID: ${payload.leadId || "—"}. Менеджер увидит её в CRM.`;
      } catch (error) {
        dom.candidateStatus.textContent = error.message || "Не удалось отправить заявку.";
      }
    });

    document.querySelectorAll("[data-home-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.homeAction;
        if (action === "support") {
          openPlaceholderSheet("Поддержка", "Кнопка связи с поддержкой внедрена. Реальный сценарий добавим следующим этапом.");
          return;
        }
        openPlaceholderSheet("В разработке", "Этот раздел уже заложен в интерфейс и будет реализован следующим этапом.");
      });
    });

    document.querySelectorAll("[data-bottom-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.bottomAction;
        if (action === "withdraw") {
          openWithdrawInfo();
          return;
        }
        if (action === "notifications") {
          openNotifications();
          return;
        }
        openPlaceholderSheet("В разработке", "Раздел уже предусмотрен на главном экране и будет реализован следующим этапом.");
      });
    });

    dom.openNotificationsCard.addEventListener("click", openNotifications);
    dom.homeNewsRow.addEventListener("click", (event) => {
      const card = event.target.closest("[data-news-id]");
      if (!card) return;
      openNewsItem(card.dataset.newsId || "");
    });
    dom.sheetBackdrop.addEventListener("click", closeSheet);
    dom.closeSheetButton.addEventListener("click", closeSheet);
  }

  bindActions();
  loadHome();
})();
