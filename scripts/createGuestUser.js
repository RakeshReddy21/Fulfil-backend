const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function createGuestUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://rkonda863_db_user:sxVwpQf9KfTBv7R7@document-parsing.3dfsce8.mongodb.net/?appName=Document-parsing');

    const guestEmail = 'john@gmail.com';
    const guestPassword = '123456';
    const guestName = 'Guest User';

    const existingUser = await User.findOne({ email: guestEmail });
    
    if (existingUser) {
      console.log('✅ Guest user already exists');
      await mongoose.connection.close();
      return;
    }

    const guestUser = new User({
      name: guestName,
      email: guestEmail,
      password: guestPassword
    });

    await guestUser.save();
    console.log('✅ Guest user created successfully');
    console.log(`   Email: ${guestEmail}`);
    console.log(`   Password: ${guestPassword}`);

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error creating guest user:', error);
    process.exit(1);
  }
}

createGuestUser();

