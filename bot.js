// Основные импорты
const fs = require('fs');
const { Telegraf, Markup } = require('telegraf');
const path = require('path');

// Токен бота
const bot = new Telegraf('6815283668:AAFxPJ1Kz-sJ5MgXKYwbArhpLmt8qi2d5cU');

// Администраторы
const ADMIN_IDS = [
    978332618,
    325746370,5396332298,960160248
];

const VP_ID = 492819651; // Замените на конкретный user_id

// Файл со стоп-словами
const banWordsFilePath = path.join(__dirname, 'banwords.json');
let keywordsBan = [];
let userStates = {};

// Загрузка стоп-слов
const loadBanWords = () => {
    if (fs.existsSync(banWordsFilePath)) {
        const data = fs.readFileSync(banWordsFilePath, 'utf8');
        keywordsBan = JSON.parse(data).keywordsBan || [];
    }
};

loadBanWords();

// Сохранение стоп-слов
const saveBanWords = () => {
    fs.writeFileSync(banWordsFilePath, JSON.stringify({ keywordsBan }, null, 2), 'utf8');
};

// Проверка администратора
const isAdmin = (userId) => ADMIN_IDS.includes(userId);

// Отправка главного меню
const sendMainMenu = (ctx) => {
    ctx.reply('Выберите действие:', Markup.inlineKeyboard([
        [Markup.button.callback('Добавить слово в бан', 'add_ban')],
        [Markup.button.callback('Удалить слово из бана', 'remove_ban')],
        [Markup.button.callback('Просмотреть список банов', 'list_ban')],
    ]));
};

// Обработка нарушения
const handleViolation = async (ctx, userId, chatId, chatTitle, foundWordsBan) => {
    if (!userStates[userId]) userStates[userId] = 0;
    userStates[userId]++;

    const banDuration = userStates[userId] >= 3 ? 0 : 0; // 7 дней или 1 час

    try {
        const sentMessage = await bot.telegram.sendMessage(
            chatId,
            `@${ctx.from.username} \nНарушение правил общения:\nС правилами можно ознакомиться:\nhttps://t.me/ecochat/835704`
        );

        // Удаляем сообщение через 10 секунд
        setTimeout(async () => {
            try {
                await bot.telegram.deleteMessage(chatId, sentMessage.message_id);
                console.log(`Сообщение ${sentMessage.message_id} удалено.`);
            } catch (deleteError) {
                console.error('Ошибка при удалении сообщения:', deleteError);
            }
        }, 10000); // 10000 миллисекунд = 10 секунд
    } catch (error) {
        if (error.response && error.response.error_code === 403) {
            console.error(`Бот был заблокирован пользователем с ID ${chatId}.`);
        } else {
            console.error('Ошибка при отправке сообщения:', error);
        }
    }

    try {
        await ctx.deleteMessage(ctx.message.message_id);
        ADMIN_IDS.forEach(adminId => {
            bot.telegram.sendMessage(adminId, `Удалено сообщение от @${ctx.from.username} (${userId}) в чате ${chatTitle}:\n"${ctx.message.text}"`);
        });

        await ctx.telegram.restrictChatMember(chatId, userId, {
            until_date: Math.floor(Date.now() / 1000) + banDuration,
            can_send_messages: false,
            can_send_media_messages: false,
            can_send_other_messages: false,
            can_add_web_page_previews: false,
        });



    } catch (error) {
        console.error('Ошибка при обработке нарушения:', error);
    }
};

// Команды для управления бан-листом
bot.command('addban', (ctx) => {
    if (isAdmin(ctx.from.id)) {
        userStates[ctx.from.id] = 'awaiting_add_ban';
        ctx.reply('Введите слово, которое хотите добавить в бан:');
    }
});

bot.command('removeban', (ctx) => {
    if (isAdmin(ctx.from.id)) {
        userStates[ctx.from.id] = 'awaiting_remove_ban';
        ctx.reply('Введите слово, которое хотите удалить из бана:');
    }
});

bot.command('listban', async (ctx) => {
    try {
        const maxMessageLength = 4000; // Максимальная длина одного сообщения
        const header = 'Список забаненных слов:';
        let message = header + '\n';

        if (keywordsBan.length > 0) {
            for (const word of keywordsBan) {
                if ((message + word + ', ').length > maxMessageLength) {
                    // Отправляем текущее сообщение, если оно достигло предела
                    await ctx.reply(message.trimEnd());
                    message = ''; // Очищаем сообщение для следующей порции
                }
                message += word + ', ';
            }

            // Отправляем оставшееся сообщение
            if (message.trim()) {
                await ctx.reply(message.trimEnd());
            }
        } else {
            await ctx.reply('Список забаненных слов пуст.');
        }
    } catch (error) {
        console.error('Ошибка при отправке списка банов:', error);
        ctx.reply('Произошла ошибка при обработке списка банов.');
    }
});

bot.command('menu', (ctx) => {
    if (isAdmin(ctx.from.id)) {
        sendMainMenu(ctx);
    }
});

// Обработка сообщений
bot.on('message', async (ctx) => {


    const userId = ctx.from.id;

    // Если сообщение от пользователя с VP_ID, пропускаем его
    if (userId === VP_ID) {
        console.log(`Сообщение от пользователя с ID ${VP_ID} игнорируется.`);
        return;
    }

    const chatId = ctx.chat.id;
    const chatTitle = ctx.chat.title || 'Личный чат';
    const messageText = ctx.message.text || '';


    if (isAdmin(ctx.from.id)) {
        if (messageText === 'меню' || messageText === 'Меню') {
            console.log('Пользователь ввел слово "меню"');
            sendMainMenu(ctx);
        }
    }

    // Проверка состояний
    const currentState = userStates[userId];
    if (currentState === 'awaiting_add_ban') {
        const wordToAdd = messageText.toLowerCase().trim();
        if (!keywordsBan.includes(wordToAdd)) {
            keywordsBan.push(wordToAdd);
            saveBanWords();
            ctx.reply(`Слово "${wordToAdd}" добавлено в список банов.`);
        } else {
            ctx.reply(`Слово "${wordToAdd}" уже есть в списке банов.`);
        }
        delete userStates[userId];
        return;
    }

    if (currentState === 'awaiting_remove_ban') {
        const wordToRemove = messageText.toLowerCase().trim();
        const index = keywordsBan.indexOf(wordToRemove);
        if (index !== -1) {
            keywordsBan.splice(index, 1);
            saveBanWords();
            ctx.reply(`Слово "${wordToRemove}" удалено из списка банов.`);
        } else {
            ctx.reply(`Слово "${wordToRemove}" не найдено в списке.`);
        }
        delete userStates[userId];
        return;
    }

    // Функция для экранирования специальных символов в словах
    function escapeRegExp(string) {
        return string.replace(/[.*+?^=!:${}()|\[\]\/\\]/g, "\\$&");
    }

// Проверка на забаненные слова
    const foundWordsBan = keywordsBan.filter(word => {
        const escapedWord = escapeRegExp(word);  // Экранируем специальные символы
        const regex = new RegExp(`(^|\\s)${escapedWord}($|\\s|[.,!?;])`, 'i'); // Регулярное выражение для поиска целого слова


        // Убедимся, что слово и сообщение нормализованы (удаление лишних пробелов, стандартный регистр)
        const normalizedMessage = messageText.trim().toLowerCase();


        const matchFound = regex.test(normalizedMessage);  // Проверяем совпадение



        return matchFound;  // Возвращаем только те слова, которые найдены
    });

// Если найдены забаненные слова, выводим их
    if (foundWordsBan.length > 0) {
        
        handleViolation(ctx, ctx.from.id, ctx.chat.id, ctx.chat.title, foundWordsBan);
    } else {
        
    }




});

// Обработка кнопок
bot.action('add_ban', (ctx) => {
    ctx.reply('Введите слово, которое хотите добавить в бан:');
    userStates[ctx.from.id] = 'awaiting_add_ban';
    ctx.answerCbQuery();
});

bot.action('remove_ban', (ctx) => {
    ctx.reply('Введите слово, которое хотите удалить из бана:');
    userStates[ctx.from.id] = 'awaiting_remove_ban';
    ctx.answerCbQuery();
});

bot.action('list_ban', async (ctx) => {
    try {
        ctx.answerCbQuery(); // Закрываем уведомление о нажатии кнопки

        if (keywordsBan.length === 0) {
            await ctx.reply('Список банов пуст.');
            return;
        }

        const maxMessageLength = 4096; // Максимальная длина одного сообщения
        const header = 'Список забаненных слов:'; // Заголовок для списка
        const words = keywordsBan.join(', '); // Список всех забаненных слов через запятую
        const chunks = []; // Массив для хранения частей сообщения

        let chunk = header + '\n';
        for (const word of keywordsBan) {
            const newChunk = chunk + word + ', ';
            if (newChunk.length > maxMessageLength) {
                chunks.push(chunk.trimEnd()); // Добавляем текущую часть в массив
                chunk = ''; // Очищаем для следующей части
            }
            chunk += word + ', ';
        }

        if (chunk.trim()) {
            chunks.push(chunk.trimEnd()); // Добавляем последнюю часть
        }

        // Отправляем каждую часть отдельно
        for (const part of chunks) {
            await ctx.reply(part);
        }
    } catch (error) {
        console.error('Ошибка при отправке списка банов:', error);
        await ctx.reply('Произошла ошибка при обработке списка банов.');
    }
});

// Обработка ошибок
bot.catch((err) => console.error('Ошибка в работе бота:', err));

// Запуск бота
bot.launch().then(() => {
    console.log('Бот успешно запущен.');
}).catch(err => console.error('Ошибка при запуске бота:', err));
