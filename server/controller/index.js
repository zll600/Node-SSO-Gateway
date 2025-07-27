const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");
const Hashids = require("hashids");
const URL = require("url").URL;
const hashids = new Hashids();
const { genJwtToken } = require("./jwt_helper");

const re = /(\S+)\s+(\S+)/;
const SALT_ROUNDS = 10;

// MongoDB Connection
const connectDB = async () => {
  try {
    const dbURI = "mongodb://localhost:27017/sso_server"; // Replace with your MongoDB URI
    await mongoose.connect(dbURI);
    console.log("Connected to MongoDB successfully");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1);
  }
};

// mongodb schema
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  userId: { type: String, required: true, unique: true },
  appPolicy: {
    type: Map,
    of: new mongoose.Schema({
      role: { type: String },
      shareEmail: { type: Boolean },
    }),
  },
});

const User = mongoose.model("User", UserSchema);
const registerUser = async (req, res) => {
  const { email, password, appPolicy } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  try {
    // Check if the user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists." });
    }


    // Create a new user
    const newUser = new User({
      email,
      password: password,
      userId: encodedId(),
      appPolicy: {
        ...appPolicy,
        simple_sso_consumer: { role: "user", shareEmail: false },
        sso_consumer: { role: "admin", shareEmail: true },
      }
    });

    await newUser.save();

    return res.redirect("/simplesso/login");
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error." });
  }
};
// Note: express http converts all headers
// to lower case.
const AUTH_HEADER = "authorization";
const BEARER_AUTH_SCHEME = "bearer";

function parseAuthHeader(hdrValue) {
  if (typeof hdrValue !== "string") {
    return null;
  }
  const matches = hdrValue.match(re);
  return matches && { scheme: matches[1], value: matches[2] };
}

const fromAuthHeaderWithScheme = function (authScheme) {
  const authSchemeLower = authScheme.toLowerCase();
  return function (request) {
    let token = null;
    if (request.headers[AUTH_HEADER]) {
      const authParams = parseAuthHeader(request.headers[AUTH_HEADER]);
      if (authParams && authSchemeLower === authParams.scheme.toLowerCase()) {
        token = authParams.value;
      }
    }
    return token;
  };
};

const fromAuthHeaderAsBearerToken = function () {
  return fromAuthHeaderWithScheme(BEARER_AUTH_SCHEME);
};

const appTokenFromRequest = fromAuthHeaderAsBearerToken();

// app token to validate the request is coming from the authenticated server only.
const appTokenDB = {
  sso_consumer: "l1Q7zkOL59cRqWBkQ12ZiGVW2DBL",
  simple_sso_consumer: "1g0jJwGmRQhJwvwNOrY4i90kD0m"
};

const alloweOrigin = {
  "http://127.0.0.1:3001": true,
  "http://127.0.0.1:3002": true,
  "http://127.0.0.1:3000": false,
};

const deHyphenatedUUID = () => uuidv4().replace(/-/gi, "");
const encodedId = () => hashids.encodeHex(deHyphenatedUUID());

// A temporary cahce to store all the application that has login using the current session.
// It can be useful for variuos audit purpose
const sessionUser = {};
const sessionApp = {};

const originAppName = {
  "http://127.0.0.1:3001": "sso_consumer",
  "http://127.0.0.1:3002": "simple_sso_consumer",
};

const userDB = {
  "ravikishan63392@gmail.com": {
    password: "test",
    userId: encodedId(), // incase you dont want to share the user-email.
    appPolicy: {
      sso_consumer: { role: "admin", shareEmail: true },
      simple_sso_consumer: { role: "user", shareEmail: false },
    },
  },
};

// these token are for the validation purpose
const intrmTokenCache = {};

const fillIntrmTokenCache = (origin, id, intrmToken) => {
  intrmTokenCache[intrmToken] = [id, originAppName[origin]];
};
const storeApplicationInCache = (origin, id, intrmToken) => {
  if (sessionApp[id] == null) {
    sessionApp[id] = {
      [originAppName[origin]]: true,
    };
    fillIntrmTokenCache(origin, id, intrmToken);
  } else {
    sessionApp[id][originAppName[origin]] = true;
    fillIntrmTokenCache(origin, id, intrmToken);
  }
  console.log({ ...sessionApp }, { ...sessionUser }, { intrmTokenCache });
};

const generatePayload = async (ssoToken) => {
  const globalSessionToken = intrmTokenCache[ssoToken][0];
  const appName = intrmTokenCache[ssoToken][1];
  const userEmail = sessionUser[globalSessionToken];
  const user = await User.findOne({ email: userEmail });
  const appPolicy = user.appPolicy.get(appName);
  const email = appPolicy.shareEmail === true ? userEmail : undefined;

  const jsonObject = {
    ...user,
    _id: user._id.toString(), // Convert ObjectId to string
    appPolicy: Object.fromEntries(user.appPolicy), // Convert Map to Object
  };
  
  // Convert ObjectId within appPolicy
  jsonObject.appPolicy = Object.entries(jsonObject.appPolicy).reduce((acc, [key, value]) => {
    acc[key] = {
      ...value,
      _id: value._id.toString() // Convert nested ObjectId to string
    };
    return acc;
  }, {});

  const appPolicyObject = jsonObject["appPolicy"][appName]
  const payload = {
    ...{...appPolicyObject},
    ...{
      email,
      shareEmail: undefined,
      uid: user.userId,
      // global SessionID for the logout functionality.
      globalSessionID: globalSessionToken,
    },
  };
  return payload;
};

const verifySsoToken = async (req, res, next) => {

  const appToken = appTokenFromRequest(req);
  const { ssoToken } = req.query;
  // if the application token is not present or ssoToken request is invalid
  // if the ssoToken is not present in the cache some is
  // smart.
  if (
    appToken == null ||
    ssoToken == null ||
    intrmTokenCache[ssoToken] == null
  ) {
    return res.status(400).json({ message: "badRequest" });
  }

  // if the appToken is present and check if it's valid for the application
  const appName = intrmTokenCache[ssoToken][1];
  const globalSessionToken = intrmTokenCache[ssoToken][0];
  // If the appToken is not equal to token given during the sso app registraion or later stage than invalid
  if (
    appToken !== appTokenDB[appName] ||
    sessionApp[globalSessionToken][appName] !== true
  ) {
    return res.status(403).json({ message: "Unauthorized" });
  }
  // checking if the token passed has been generated
  const payload = await generatePayload(ssoToken);

  const token = await genJwtToken(payload);
  // delete the itremCache key for no futher use,
  delete intrmTokenCache[ssoToken];
  return res.status(200).json({ token });
};
const doLogin = async (req, res, next) => {
  // do the validation with email and password
  // but the goal is not to do the same in this right now,
  // like checking with Datebase and all, we are skiping these section
  const { email, password } = req.body;
  // if (!(userDB[email] && password === userDB[email].password)) {
  //   return res.status(404).json({ message: "Invalid email and password" });
  // }
  if (!email || !password) {
    return res.status(400).json({ message: "Missing required fields." });
  }

  // Check if the user already exists
  const existingUser = await User.findOne({ email });
  if (!existingUser) {
    return res.status(400).json({ message: "User not found." });
  }

  const match = password == existingUser.password;
  if (!match) {
    return res.status(400).json({ message: "Invalid password." });
  }

  // else redirect
  const { serviceURL } = req.query;
  const id = encodedId();
  req.session.user = id;
  sessionUser[id] = email;
  if (serviceURL == null) {
    return res.redirect("/");
  }
  const url = new URL(serviceURL);
  const intrmid = encodedId();
  storeApplicationInCache(url.origin, id, intrmid);
  return res.redirect(`${serviceURL}?ssoToken=${intrmid}`);
};

const login = (req, res, next) => {
  // The req.query will have the redirect url where we need to redirect after successful
  // login and with sso token.
  // This can also be used to verify the origin from where the request has came in
  // for the redirection
  const { serviceURL } = req.query;
  // direct access will give the error inside new URL.
  if (serviceURL != null) {
    const url = new URL(serviceURL);
    if (alloweOrigin[url.origin] !== true) {
      return res
        .status(400)
        .json({ message: "Your are not allowed to access the sso-server" });
    }
  }
  if (req.session.user != null && serviceURL == null) {
    return res.redirect("/");
  }
  // if global session already has the user directly redirect with the token
  if (req.session.user != null && serviceURL != null) {
    const url = new URL(serviceURL);
    const intrmid = encodedId();
    storeApplicationInCache(url.origin, req.session.user, intrmid);
    return res.redirect(`${serviceURL}?ssoToken=${intrmid}`);
  }


  return res.render("login", {
    title: "SSO-Server | Login",
  });
};
module.exports = Object.assign({}, { doLogin, login, verifySsoToken, registerUser, connectDB });
