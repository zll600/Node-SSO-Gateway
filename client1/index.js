const express = require("express");
const morgan = require("morgan");
const app = express();
const engine = require("ejs-mate");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const MongoStore = require("connect-mongo");

const isAuthenticated = require("./isAuthenticated");
const checkSSORedirect = require("./checkSSORedirect");

app.use(
  session({
    secret: "relax2", // Different secret than SSO server
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // true if using HTTPS
      httpOnly: true,
      sameSite: 'lax', // Adjust to 'none' for cross-origin; use 'lax' for same-origin
    },
  })
);
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(morgan("dev"));
app.engine("ejs", engine);
app.set("views", __dirname + "/views");
app.set("view engine", "ejs");
app.use(checkSSORedirect());

const logout = (req, res, next) => {
  // logout the user from the application
  // and redirect to the SSO Server for logout
  // pass the redirect URL as current URL
  // serviceURL is where the sso should redirect in case of valid user
  const redirectURL = `${req.protocol}://${req.headers.host}${req.path}`;
  req.session.destroy();
  return res.redirect(
    `http://127.0.0.1:3000/simplesso/logout?serviceURL=${redirectURL}`
  );
};


app.get("/", isAuthenticated, (req, res, next) => {
  res.render("index", {
    what: `SSO-Consumer One ${JSON.stringify(req.session.user)}`,
    title: "SSO-Consumer | Home",
  });
});

app.get('/logout', logout);

app.use((req, res, next) => {
  // catch 404 and forward to error handler
  const err = new Error("Resource Not Found");
  err.status = 404;
  next(err);
});

app.use((err, req, res, next) => {
  console.error({
    message: err.message,
    error: err,
  });
  const statusCode = err.status || 500;
  let message = err.message || "Internal Server Error";

  if (statusCode === 500) {
    message = "Internal Server Error";
  }
  res.status(statusCode).json({ message });
});

app.listen(3001, () => {
  console.log("SSO-Consumer One is running on port 3001");
});
