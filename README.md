brew tap mongodb/brew

brew install mongodb-community@4.2

https://github.com/optimalbits/bull#separate-processes

https://optimalbits.github.io/bull/







# Server installation Ubuntu 16.04

https://github.com/pyenv/pyenv-installer

Pre-requisites: https://github.com/pyenv/pyenv/wiki/Common-build-problems

pyenv install 3.7.4

> pyenv versions
* system (set by /home/adet/.pyenv/version)
  3.7.4
  
  
> pip install numpy
> pip instal matplotlib



Use PM2 with Environment
> pm2 start ecosystem.config.js --env production


Test with Mocha
NODE_ENV=production mocha --timeout=50000 test/1000_Python_Test.js 


Mongo Notes
// Update and add field
> db.job_data.update({user_token: "1"}, { $set: { "archived": false }}, false, true)

