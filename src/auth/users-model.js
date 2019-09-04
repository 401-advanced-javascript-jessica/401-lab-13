'use strict';

/**
 * User Model
 * @module src/auth/users-model
 */

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const SINGLE_USE = !!process.env.SINGLE_USE;
const TOKEN_EXPIRE_TIME = process.env.TOKEN_EXPIRE_TIME || '5m';
const SECRET = process.env.SECRET || 'testSecret';

const usedTokens = new Set();

const users = new mongoose.Schema({
  username: {type:String, required:true, unique:true},
  password: {type:String, required:true},
  email: {type: String},
  role: {type: String, default:'user', enum: ['admin','editor','user']},
});

users.pre('save', function(next) {
  bcrypt.hash(this.password, 10)
    .then(hashedPassword => {
      this.password = hashedPassword;
      next();
    })
    .catch(console.error);
});

/**
 * Creates a user from Oauth
 * @method createFromOauth
 * @param email
 * @returns {Promise<never>|Promise<unknown>}
 */
users.statics.createFromOauth = function(email) {

  if(! email) { return Promise.reject('Validation Error'); }

  return this.findOne( {email} )
    .then(user => {
      if( !user ) { throw new Error('User Not Found'); }
      console.log('Welcome Back', user.username);
      return user;
    })
    .catch( error => {
      console.log('Creating new user');
      let username = email;
      let password = 'none';
      return this.create({username, password, email});
    });

};

/**
 * Checks to see if the user exists
 * @method authenticateBasic
 * @param auth
 * @returns {Promise<unknown>}
 */
users.statics.authenticateBasic = function(auth) {
  let query = {username:auth.username};
  return this.findOne(query)
    .then( user => user && user.comparePassword(auth.password) )
    .catch(error => {throw error;});
};

/**
 * authenticates a user based on token
 * @method authenticateToken
 * @param token
 * @returns {Promise<never>|void|Query}
 */
users.statics.authenticateToken = function(token){

  if (usedTokens.has(token)) {
    return Promise.reject('Invalid Token');
  }

  try {
    let parsedToken = jwt.verify(token, SECRET);
    if ( SINGLE_USE && parsedToken.type !== 'key'){
      usedTokens.add(token);
    }
    let query = {_id: parsedToken.id};
    return this.findOne(query);
  } catch (error) { throw new Error('Invalid Token'); }

  // const decryptedToken = jwt.verify(token, process.env.SECRET || 'TestSecret');
  // const query = { _id: decryptedToken.id };
  // return this.findOne(query);
};

/**
 * checks the given password against the stored password
 * @method comparePassword
 * @param password
 * @returns {Promise<unknown>}
 */
users.methods.comparePassword = function(password) {
  return bcrypt.compare( password, this.password )
    .then( valid => valid ? this : null);
};

/**
 * generates a new token
 * @method generateToken
 * @param type
 * @returns {undefined|*}
 */
users.methods.generateToken = function(type) {
  
  let token = {
    id: this._id,
    role: this.role,
    type: type || 'regular',
  };

  let signOptions = {};
  if(type !== 'key' && TOKEN_EXPIRE_TIME){
    signOptions = { expiresIn: TOKEN_EXPIRE_TIME};
  }
  
  return jwt.sign(token, SECRET, signOptions);
};

// users.methods.generateKey = function() {
//   return this.generateToken('key');
// };

module.exports = mongoose.model('users', users);
