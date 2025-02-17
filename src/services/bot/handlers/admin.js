const { Scenes, Markup } = require('telegraf');
const User = require('../../../models/user');
const Order = require('../../../models/order');
const { Price } = require('../../../models/price');
const logger = require('../../../utils/logger');
const config = require('../../../config');

// 创建管理员场景
const adminScene = new Scenes.BaseScene('admin');

// 进入管理员场景
adminScene.enter(async (ctx) => {
    try {
        const user = await User.findOne({ telegramId: ctx.from.id });
        if (!user || !user.isAdmin) {
            await ctx.reply('您没有管理员权限。');
            return ctx.scene.leave();
        }

        const buttons = [
            [
                Markup.button.callback('👥 用户管理', 'admin_users'),
                Markup.button.callback('📊 订单管理', 'admin_orders')
            ],
            [
                Markup.button.callback('💰 价格管理', 'admin_prices'),
                Markup.button.callback('⚙️ 系统设置', 'admin_settings')
            ],
            [
                Markup.button.callback('❌关闭', 'close')
            ]
        ];

        if (ctx.callbackQuery) {
            await ctx.editMessageText(
                '欢迎使用管理员控制面板\n请选择要管理的内容：',
                Markup.inlineKeyboard(buttons)
            );
        } else {
            await ctx.reply(
                '欢迎使用管理员控制面板\n请选择要管理的内容：',
                Markup.inlineKeyboard(buttons)
            );
        }
    } catch (error) {
        logger.error('Error in admin scene:', error);
        await ctx.reply('发生错误，请重试。');
        ctx.scene.leave();
    }
});

// 用户管理
adminScene.action('admin_users', async (ctx) => {
    try {
        const users = await User.find().sort({ createdAt: -1 }).limit(10);
        let message = '👥 最近注册的用户：\n\n';
        
        for (const user of users) {
            message += `ID: ${user.telegramId}\n`;
            message += `用户名: ${user.username || '未设置'}\n`;
            message += `账号状态: ${user.status === 'active' ? '正常' : '被禁'}\n`;
            message += `注册时间: ${user.createdAt.toLocaleString()}\n\n`;
        }

        const buttons = [
            [Markup.button.callback('🔍 搜索用户', 'search_user')],
            [Markup.button.callback('返回', 'back_to_admin')]
        ];

        await ctx.editMessageText(message, Markup.inlineKeyboard(buttons));
    } catch (error) {
        logger.error('Error in admin users:', error);
        await ctx.answerCbQuery('获取用户列表失败');
    }
});

// 显示订单列表
async function showAdminOrderList(ctx, page = 1, query = null) {
    try {
        let condition = {}
        if (query != null && query.match(/^\d+/)) {
            condition = {
                $or: [
                    { orderId: query },
                    // 先找到用户，然后查询该用户的订单
                    { userId: { $in: await User.find({ telegramId: parseInt(query) || 0 }).distinct('_id') }}
                ]
            }
        } else if (query != null) {
            condition.status = query
        }
        const orders = await Order.find(condition)
            .sort({ createdAt: -1 })
            .skip((page - 1) * 5)
            .limit(5)
            .populate('userId');

        const total = await Order.countDocuments(condition);
        const totalPages = Math.ceil(total / 5);

        if (!orders.length) {
            await ctx.editMessageText(
                '暂无订单记录。',
                Markup.inlineKeyboard([[Markup.button.callback('返回', 'back_to_admin')]])
            );
            return;
        }

        let message = '📊 订单列表：\n\n';
        
        for (const order of orders) {
            message += `订单号: ${order.orderId}\n`;
            if (order.userId.username) {
                message += `下单用户: @${order.userId.username}\n`;
            } else {
                message += `下单用户: ${order.userId.telegramId}\n`;
            }
            message += `开通账号: @${order.username}\n`;
            message += `金额: ${order.amount} USDT\n`;
            message += `状态: ${getOrderStatus(order.status)}\n`;
            if (order.status === 'failed') {
                message += `失败原因: ${order.failureReason}\n`;
            }
            message += `创建时间: ${order.createdAt.toLocaleString()}\n\n`;
        }

        message += `页码: ${page}/${totalPages}`;

        const buttons = [];
        
        // 分页按钮
        if (totalPages > 1) {
            const pageButtons = [];
            if (page > 1) {
                if (query == null) {
                    pageButtons.push(Markup.button.callback('⬅️上一页', `admin_orders_page:${page - 1}`));
                } else {
                    pageButtons.push(Markup.button.callback('⬅️上一页', `admin_orders_page:${page - 1}:${query}`));
                }
            }
            if (page < totalPages) {
                if (query == null) {
                    pageButtons.push(Markup.button.callback('➡️下一页', `admin_orders_page:${page + 1}`));
                } else {
                    pageButtons.push(Markup.button.callback('➡️下一页', `admin_orders_page:${page + 1}:${query}`));
                }
            }
            buttons.push(pageButtons);
        }

        // 功能按钮
        buttons.push([
            Markup.button.callback('🔍 搜索订单', 'search_order'),
            Markup.button.callback('🔍 按状态筛选', 'admin_filter_status')
        ]);

        // 状态筛选按钮
        buttons.push([
            Markup.button.callback('📈 统计数据', 'order_stats')
        ]);

        // 返回按钮
        buttons.push([Markup.button.callback('返回', 'back_to_admin')]);

        if (ctx.callbackQuery) {
            await ctx.editMessageText(message, Markup.inlineKeyboard(buttons));
        } else {
            ctx.reply(message, Markup.inlineKeyboard(buttons))
        }
    } catch (error) {
        logger.error('Error showing admin order list:', error);
        await ctx.answerCbQuery('获取订单列表失败');
    }
}

// 订单管理
adminScene.action('admin_orders', async (ctx) => {
    await showAdminOrderList(ctx, 1);
});

// 处理管理员订单分页
adminScene.action(/admin_orders_page:(\d+)/, async (ctx) => {
    try {
        const page = parseInt(ctx.match[1]);
        await showAdminOrderList(ctx, page);
    } catch (error) {
        logger.error('Error in admin pagination:', error);
        await ctx.answerCbQuery('获取订单列表失败，请重试');
    }
});

// 处理管理员订单分页
adminScene.action(/admin_orders_page:(\d+):(.+)/, async (ctx) => {
    try {
        const page = parseInt(ctx.match[1]);
        const query = ctx.match[2]
        await showAdminOrderList(ctx, page, query);
    } catch (error) {
        logger.error('Error in admin pagination:', error);
        await ctx.answerCbQuery('获取订单列表失败，请重试');
    }
});

// 处理管理员订单刷新
adminScene.action(/admin_orders_refresh:(\d+)/, async (ctx) => {
    try {
        const page = parseInt(ctx.match[1]);
        await showAdminOrderList(ctx, page);
        await ctx.answerCbQuery('已刷新');
    } catch (error) {
        logger.error('Error refreshing admin list:', error);
        await ctx.answerCbQuery('刷新失败，请重试');
    }
});

// 处理管理员订单状态筛选
adminScene.action('admin_filter_status', async (ctx) => {
    const buttons = [
        [
            Markup.button.callback('全部订单', 'admin_filter:all'),
            Markup.button.callback('待支付', 'admin_filter:pending')
        ],
        [
            Markup.button.callback('已支付', 'admin_filter:paid'),
            Markup.button.callback('已完成', 'admin_filter:completed')
        ],
        [
            Markup.button.callback('已失败', 'admin_filter:failed'),
            Markup.button.callback('已过期', 'admin_filter:expired')
        ],
        [
            Markup.button.callback('已退款', 'admin_filter:refunded')
        ],
        [Markup.button.callback('返回', 'admin_orders')]
    ];

    await ctx.editMessageText(
        '请选择要查看的订单状态：',
        Markup.inlineKeyboard(buttons)
    );
});

// 处理管理员订单状态筛选选择
adminScene.action(/admin_filter:(.+)/, async (ctx) => {
    try {
        const status = ctx.match[1];
        const filteredStatus = status === 'all' ? null : status;
        await showAdminOrderList(ctx, 1, filteredStatus);
    } catch (error) {
        logger.error('Error filtering admin orders:', error);
        await ctx.answerCbQuery('筛选失败，请重试');
    }
});

// 价格管理
adminScene.action('admin_prices', async (ctx) => {
    try {
        const prices = await Price.find().sort({ months: 1 });
        let message = '💰 当前价格设置：\n\n';
        
        for (const price of prices) {
            message += `${price.duration}个月套餐：\n`;
            message += `价格：${price.price} USDT\n`;
            message += `折扣：${price.discount || 0}%\n\n`;
        }

        const buttons = [
            [
                Markup.button.callback('✏️ 修改套餐', 'edit_price')
            ],
            [Markup.button.callback('返回', 'back_to_admin')]
        ];

        await ctx.editMessageText(message, Markup.inlineKeyboard(buttons));
    } catch (error) {
        logger.error('Error in admin prices:', error);
        await ctx.answerCbQuery('获取价格列表失败');
    }
});

// 系统设置
adminScene.action('admin_settings', async (ctx) => {
    const settings = config.bot;
    let message = '⚙️ 系统设置：\n\n';
    
    message += `机器人名称：${settings.username}\n`;
    message += `支付超时时间：${settings.paymentTimeout} 分钟\n`;
    message += `代理状态：${settings.proxy.enabled ? '启用' : '禁用'}\n`;
    
    if (settings.proxy.enabled) {
        message += `代理类型：${settings.proxy.type}\n`;
        message += `代理地址：${settings.proxy.host}:${settings.proxy.port}\n`;
    }

    const buttons = [
        // [Markup.button.callback('📝 修改设置', 'edit_settings')],
        [Markup.button.callback('返回', 'back_to_admin')]
    ];

    await ctx.editMessageText(message, Markup.inlineKeyboard(buttons));
});

// 返回管理面板
adminScene.action('back_to_admin', async (ctx) => {
    await ctx.scene.reenter();
});

// 关闭
adminScene.action('close', async (ctx) => {
    await ctx.deleteMessage(ctx.msgId)
    ctx.scene.leave();
});

// 搜索用户
adminScene.action('search_user', async (ctx) => {
    await ctx.reply('请输入要搜索的用户 ID 或用户名：');
    ctx.scene.state.waitingForUserSearch = true;
});

// 搜索用户
adminScene.hears((_, ctx) => {
    return ctx.scene.state.waitingForUserSearch
}, async (ctx) => {
    try {
        const query = ctx.message.text;
        const user = await User.findOne({
            $or: [
                { telegramId: parseInt(query) || 0 },
                { username: new RegExp(query, 'i') }
            ]
        });

        if (!user) {
            await ctx.reply(
                '未找到用户。\n请重新输入或点击返回：',
                Markup.inlineKeyboard([[Markup.button.callback('返回', 'admin_users')]])
            );
            return;
        }

        let message = '👤 用户信息：\n\n';
        message += `ID: ${user.telegramId}\n`;
        message += `用户名: ${user.username || '未设置'}\n`;
        message += `账号状态: ${user.status === 'active' ? '正常' : '被禁'}\n`;
        message += `注册时间: ${user.createdAt.toLocaleString()}\n`;
        
        const buttons = [
            [
                Markup.button.callback(
                    user.status === 'active' ? '🚫 封禁用户' : '✅ 解封用户',
                    `toggle_ban:${user.telegramId}`
                )
            ],
            [Markup.button.callback('返回', 'admin_users')]
        ];

        await ctx.reply(message, Markup.inlineKeyboard(buttons));
        ctx.scene.state.waitingForUserSearch = false;
    } catch (error) {
        logger.error('Error searching user:', error);
        await ctx.reply('搜索用户失败，请重试。');
    }
});

// 搜索订单
adminScene.hears((value, ctx) => {
    return value.match(/^\d+/) && ctx.scene.state.waitingForOrderSearch
}, async (ctx) => {
    try {
        const query = ctx.message.text;
        showAdminOrderList(ctx, 1, query)
        // const order = await Order.find({
        //     $or: [
        //         { orderId: query },
        //         // 先找到用户，然后查询该用户的订单
        //         { userId: { $in: await User.find({ telegramId: parseInt(query) || 0 }).distinct('_id') }}
        //     ]
        // }).populate('userId');

        // if (!order) {
        //     await ctx.reply(
        //         '未找到订单。\n请重新输入或点击返回：',
        //         Markup.inlineKeyboard([[Markup.button.callback('返回', 'admin_orders')]])
        //     );
        //     return;
        // }

        // let message = '📋 订单详情：\n\n';
        // message += `订单号: ${order.orderId}\n`;
        // if (order.userId.username) {
        //     message += `下单用户: @${order.userId.username}\n`;
        // } else {
        //     message += `下单用户: ${order.userId.telegramId}\n`;
        // }
        // message += `开通账号: @${order.username}\n`;
        // message += `金额: ${order.amount} USDT\n`;
        // message += `状态: ${getOrderStatus(order.status)}\n`;
        // if (order.status == 'failed') {
        //     message += `失败原因: ${order.failureReason}\n`;
        // }
        // message += `创建时间: ${order.createdAt.toLocaleString()}\n`;
        
        // if (order.transactionHash) {
        //     message += `USDT 交易: \`${order.transactionHash}\`\n`;
        // }
        // if (order.tonTransactionHash) {
        //     message += `TON 交易: \`${order.tonTransactionHash}\`\n`;
        // }
        // if (order.failureReason) {
        //     message += `失败原因: ${order.failureReason}\n`;
        // }

        // const buttons = [
        //     [Markup.button.callback('返回', 'admin_orders')]
        // ];

        // // 如果订单发货失败，添加退款按钮
        // if (order.status === 'failed') {
        //     buttons.unshift([
        //         Markup.button.callback('💰 退款', `refund_order:${order.orderId}`)
        //     ]);
        // }

        // await ctx.reply(message, {
        //     reply_markup: Markup.inlineKeyboard(buttons)
        // });
        ctx.scene.state.waitingForOrderSearch = false;
    } catch (error) {
        logger.error('Error searching order:', error);
        await ctx.reply('搜索订单失败，请重试。');
    }
});

// 修改价格
adminScene.hears((value, ctx) => {
    return value.match(/^\d+\s+\d+(\.\d+)?\s+\d+$/) && ctx.scene.state.waitingForPriceEdit
}, async (ctx) => {
    try {
        const [duration, price, discount] = ctx.message.text.split(' ').map(Number);
        
        if (isNaN(duration) || isNaN(price) || isNaN(discount)) {
            await ctx.reply(
                '输入格式错误。\n请按照格式重新输入或点击返回：',
                Markup.inlineKeyboard([[Markup.button.callback('返回', 'admin_prices')]])
            );
            return;
        }

        await Price.findOneAndUpdate(
            { duration },
            {
                duration,
                price,
                discount,
                description: `${duration}个月套餐`
            },
            { upsert: true }
        );

        await ctx.reply('价格更新成功！');
        ctx.scene.state.waitingForPriceEdit = false;
        await ctx.scene.reenter();
    } catch (error) {
        logger.error('Error updating price:', error);
        await ctx.reply('更新价格失败，请重试。');
    }
});

// 搜索订单
adminScene.action('search_order', async (ctx) => {
    await ctx.reply('请输入要搜索的订单号或用户 ID：');
    ctx.scene.state.waitingForOrderSearch = true;
});

// 订单统计
adminScene.action('order_stats', async (ctx) => {
    try {
        const [todayStats, totalStats] = await Promise.all([
            Order.aggregate([
                {
                    $match: {
                        createdAt: {
                            $gte: new Date(new Date().setHours(0, 0, 0, 0))
                        }
                    }
                },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 },
                        amount: { $sum: '$amount' }
                    }
                }
            ]),
            Order.aggregate([
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 },
                        amount: { $sum: '$amount' }
                    }
                }
            ])
        ]);

        let message = '📊 订单统计\n\n';
        
        message += '今日统计：\n';
        message += formatOrderStats(todayStats);
        
        message += '\n总体统计：\n';
        message += formatOrderStats(totalStats);

        const buttons = [[Markup.button.callback('返回', 'admin_orders')]];
        
        await ctx.editMessageText(message, Markup.inlineKeyboard(buttons));
    } catch (error) {
        logger.error('Error getting order stats:', error);
        await ctx.answerCbQuery('获取统计数据失败');
    }
});

// 修改价格
adminScene.action('edit_price', async (ctx) => {
    await ctx.reply(
        '请输入套餐信息，格式：月数 价格 折扣\n' +
        '例如：3 14 0\n' +
        '表示 3个月套餐，价格14 USDT，无折扣\n\n' +
        '注意：\n' +
        '• 月数必须为整数\n' +
        '• 价格可以带小数\n' +
        '• 折扣为0-100的整数'
    );
    ctx.scene.state.waitingForPriceEdit = true;
});

// 封禁/解封用户
adminScene.action(/toggle_ban:(\d+)/, async (ctx) => {
    try {
        const telegramId = parseInt(ctx.match[1]);
        const user = await User.findOne({ telegramId });
        
        if (!user) {
            await ctx.answerCbQuery('用户不存在');
            return;
        }

        user.status = user.status === 'active' ? 'banned' : 'active';
        await user.save();

        let message = '👤 用户信息：\n\n';
        message += `ID: ${user.telegramId}\n`;
        message += `用户名: ${user.username || '未设置'}\n`;
        message += `账号状态: ${user.status === 'active' ? '正常' : '被禁'}\n`;
        message += `注册时间: ${user.createdAt.toLocaleString()}\n`;
        
        const buttons = [
            [
                Markup.button.callback(
                    user.status === 'active' ? '🚫 封禁用户' : '✅ 解封用户',
                    `toggle_ban:${user.telegramId}`
                )
            ],
            [Markup.button.callback('返回', 'admin_users')]
        ];

        await ctx.editMessageText(message, Markup.inlineKeyboard(buttons));
    } catch (error) {
        logger.error('Error toggling user ban:', error);
        await ctx.answerCbQuery('操作失败，请重试');
    }
});

// 处理退款
adminScene.action(/refund_order:(.+)/, async (ctx) => {
    try {
        const orderId = ctx.match[1];
        const order = await Order.findOne({ orderId }).populate('userId');
        
        if (!order) {
            await ctx.answerCbQuery('订单不存在');
            return;
        }

        order.status = 'refunded';
        await order.save();

        // 发送退款通知
        const refundMessage = 
            `💰 *订单已退款*\n\n` +
            `订单号: \`${order.orderId}\`\n` +
            `金额: *${order.amount}* USDT\n\n` +
            `如有疑问，请联系客服。`;

        await ctx.telegram.sendMessage(
            order.userId.telegramId,
            refundMessage,
            { parse_mode: 'Markdown' }
        );

        await ctx.answerCbQuery('退款成功');
        await ctx.scene.reenter();
    } catch (error) {
        logger.error('Error refunding order:', error);
        await ctx.answerCbQuery('退款失败，请重试');
    }
});

// 格式化订单状态
function getOrderStatus(status) {
    const statusMap = {
        pending: '⏳ 待支付',
        paid: '💱 已支付',
        completed: '✅ 已完成',
        failed: '❌ 已失败',
        expired: '⚠️ 已过期',
        refunded: '↩️ 已退款'
    };
    return statusMap[status] || status;
}

// 格式化订单统计
function formatOrderStats(stats) {
    let message = '';
    let totalCount = 0;
    let totalAmount = 0;

    stats.forEach(stat => {
        message += `${getOrderStatus(stat._id)}: ${stat.count} 笔`;
        if (stat.amount) {
            message += `, ${stat.amount.toFixed(2)} USDT`;
        }
        message += '\n';
        
        totalCount += stat.count;
        totalAmount += stat.amount || 0;
    });

    message += `\n总计: ${totalCount} 笔, ${totalAmount.toFixed(2)} USDT\n`;
    return message;
}

// 导出场景和设置函数
const setupAdminHandlers = (bot) => {
    // 这里可以添加其他非场景相关的处理程序
};

module.exports = {
    adminScene,
    setupAdminHandlers
}; 