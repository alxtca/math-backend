const User = require("../models/User")
const Post = require("../models/Post")
const Follow = require("../models/Follow")
const jwt = require("jsonwebtoken")

//clean up later
const userCollection = require('../db').db().collection("users")
const {ObjectId} = require('mongodb')
const md5 = require('md5')

// how long a token lasts before expiring
const tokenLasts = "365d"
// create object with max possible values for each mode and level
const MaxPossible = {
  plus: {
    1: 100,
    2: 200,
    3: 300,
    4: 400,
    5: 500,
  },
  minus: {
    1:100,
    2:200,
    3:300,
    4:400,
    5:500,
  },
  divide: {
    1:200,
    2:300,
    3:400,
    4:600,
    5:700,
  },
  mult: {
    1:200,
    2:300,
    3:400,
    4:600,
    5:700,
  }
}
// to create math mode object in db with initial values
const cleanStartMathModes = {
  plus: {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  },
  minus: {
    1:0,
    2:0,
    3:0,
    4:0,
    5:0,
  },
  divide: {
    1:0,
    2:0,
    3:0,
    4:0,
    5:0,
  },
  mult: {
    1:0,
    2:0,
    3:0,
    4:0,
    5:0,
  }
}

exports.mathLeaderboard = async function(req, res) {
  try {
    const query = {totalMathScore: {$gt: 0 }}
    const project = {_id: 0, username: 1, totalMathScore: 1, email: 1}
    const sort = {totalMathScore: -1}
    const results = await userCollection.find(query).project(project).sort(sort).limit(10).toArray()
    //for each array item in results add avatar: `https://gravatar.com/avatar/${md5(results.email)}?s=128`
    const resultsWithAvatars = results.map(obj =>{
      const av = `https://gravatar.com/avatar/${md5(obj.email)}?s=128`
      //delete key email
      delete obj.email
      return {...obj, avatar: av}
    })
    //console.log(resultsWithAvatars)
    res.json(resultsWithAvatars)
  } catch(e){
    console.log(e)
  }
}

exports.mathOverallScore = async function (req, res){
  try {
    viewer = jwt.verify(req.body.token, process.env.JWTSECRET)
    const result = await userCollection.findOne({_id: ObjectId(viewer._id)})
    //check if user has totalMathScore
    if('totalMathScore' in result) {
      console.log("total score: " + result.totalMathScore)
      res.json(result.totalMathScore)
    } else {
      console.log("total score is not registered yet. total score: " + 0)
      res.json(0)
    }    

  } catch(e) {
    console.log(e)
  }
}

exports.mathChallengeResults = async function (req, res) {
  let soFarEarnedForThisModeAndLevel
  let totalMathScore = 0
  let mathModes = cleanStartMathModes
//extract user _id from token
  try {
    viewer = jwt.verify(req.body.token, process.env.JWTSECRET)

    //1. find current score to user in db.            - Alt: could stay in front end and be sendt with token (is this secure?).
    const result = await userCollection.findOne({_id: ObjectId(viewer._id)})    //dig into result obj: result.name, result.email, result._id
  
    //check if math mode exist for current user in db and use it.
    if('mathModes' in result){
      mathModes = result.mathModes
    }
    soFarEarnedForThisModeAndLevel = mathModes[req.body.mode][req.body.level]

    //2. calculate points earned in this session
    const max_possible = MaxPossible[req.body.mode][req.body.level]
    const earnedPointsNow = Math.round((max_possible - soFarEarnedForThisModeAndLevel)*req.body.totCoef*0.1)
    //check if user has totalMathScore
    if('totalMathScore' in result){
      totalMathScore = result.totalMathScore
    }
    totalMathScore += earnedPointsNow
    mathModes[req.body.mode][req.body.level]  += earnedPointsNow

    //3. update totalMathScore in db for current user, and update "so far earned in db"
    const updateResult = await userCollection.updateOne({_id: ObjectId(viewer._id)}, {$set: {totalMathScore, mathModes}})
    //console.log(updateResult)

    //4. send response to front end with points earned

    //console.log(req.body)
    console.log(updateResult.modifiedCount)

     if (updateResult.modifiedCount > 0) {
        res.json(earnedPointsNow)
    } else {
      res.json(false)
    }
    
  } catch (e) {
    console.log(e)
  }
}

exports.apiGetPostsByUsername = async function (req, res) {
  try {
    let authorDoc = await User.findByUsername(req.params.username)
    let posts = await Post.findByAuthorId(authorDoc._id)
    //res.header("Cache-Control", "max-age=10").json(posts)
    res.json(posts)
  } catch (e) {
    res.status(500).send("Sorry, invalid user requested.")
  }
}

exports.checkToken = function (req, res) {
  try {
    req.apiUser = jwt.verify(req.body.token, process.env.JWTSECRET)
    res.json(true)
  } catch (e) {
    res.json(false)
  }
}

exports.apiMustBeLoggedIn = function (req, res, next) {
  try {
    req.apiUser = jwt.verify(req.body.token, process.env.JWTSECRET)
    next()
  } catch (e) {
    res.status(500).send("Sorry, you must provide a valid token.")
  }
}

exports.doesUsernameExist = function (req, res) {
  User.findByUsername(req.body.username.toLowerCase())
    .then(function () {
      res.json(true)
    })
    .catch(function (e) {
      res.json(false)
    })
}

exports.doesEmailExist = async function (req, res) {
  let emailBool = await User.doesEmailExist(req.body.email)
  res.json(emailBool)
}

exports.sharedProfileData = async function (req, res, next) {
  let viewerId
  try {
    viewer = jwt.verify(req.body.token, process.env.JWTSECRET)
    viewerId = viewer._id
  } catch (e) {
    viewerId = 0
  }
  req.isFollowing = await Follow.isVisitorFollowing(req.profileUser._id, viewerId)

  let postCountPromise = Post.countPostsByAuthor(req.profileUser._id)
  let followerCountPromise = Follow.countFollowersById(req.profileUser._id)
  let followingCountPromise = Follow.countFollowingById(req.profileUser._id)
  let [postCount, followerCount, followingCount] = await Promise.all([postCountPromise, followerCountPromise, followingCountPromise])

  req.postCount = postCount
  req.followerCount = followerCount
  req.followingCount = followingCount

  next()
}

exports.apiLogin = function (req, res) {
  let user = new User(req.body)
  user
    .login()
    .then(function (result) {
      res.json({
        token: jwt.sign(
          {
            _id: user.data._id,
            username: user.data.username,
            avatar: user.avatar
          },
          process.env.JWTSECRET,
          { expiresIn: tokenLasts }
        ),
        username: user.data.username,
        avatar: user.avatar
      })
    })
    .catch(function (e) {
      res.json(false)
    })
}

exports.apiRegister = function (req, res) {
  let user = new User(req.body)
  user
    .register()
    .then(() => {
      res.json({
        token: jwt.sign({ _id: user.data._id, username: user.data.username, avatar: user.avatar }, process.env.JWTSECRET, { expiresIn: tokenLasts }),
        username: user.data.username,
        avatar: user.avatar
      })
    })
    .catch(regErrors => {
      res.status(500).send(regErrors)
    })
}

exports.apiGetHomeFeed = async function (req, res) {
  try {
    let posts = await Post.getFeed(req.apiUser._id)
    res.json(posts)
  } catch (e) {
    res.status(500).send("Error")
  }
}

exports.ifUserExists = function (req, res, next) {
  User.findByUsername(req.params.username)
    .then(function (userDocument) {
      req.profileUser = userDocument
      next()
    })
    .catch(function (e) {
      res.json(false)
    })
}

exports.profileBasicData = function (req, res) {
  res.json({
    profileUsername: req.profileUser.username,
    profileAvatar: req.profileUser.avatar,
    isFollowing: req.isFollowing,
    counts: { postCount: req.postCount, followerCount: req.followerCount, followingCount: req.followingCount }
  })
}

exports.profileFollowers = async function (req, res) {
  try {
    let followers = await Follow.getFollowersById(req.profileUser._id)
    //res.header("Cache-Control", "max-age=10").json(followers)
    res.json(followers)
  } catch (e) {
    res.status(500).send("Error")
  }
}

exports.profileFollowing = async function (req, res) {
  try {
    let following = await Follow.getFollowingById(req.profileUser._id)
    //res.header("Cache-Control", "max-age=10").json(following)
    res.json(following)
  } catch (e) {
    res.status(500).send("Error")
  }
}
