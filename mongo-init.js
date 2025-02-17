db.createUser({
    user: 'premium_bot_user',
    pwd: 'your_strong_password',
    roles: [
        {
            role: 'readWrite',
            db: 'premium-bot'
        }
    ]
}); 