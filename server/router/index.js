const express = require("express");

const router = express.Router();
const controller = require("../controller");

router
  .route("/login")
  .get(controller.login)
  .post(controller.doLogin);

router.get("/verifytoken", controller.verifySsoToken);
router.get("/login", controller.login);
router.post("/register", controller.registerUser);
router.get("/register", (req, res, next) => {
  res.render("register", {
    title: "SSO-Server | Register",
  });
});

router.get("/doLogout", (req, res, next) => {
  req.session = null;
  res.redirect("/");
});

router.get("/logout", (req, res, next) => {
  const { serviceURL } = req.query;
  if (serviceURL == null) {
    return res.redirect("/");
  }
  const url = new URL(serviceURL);
  
  // get '/' from the url
  const redirectURL = url.origin;
 
  req.session = null;
  return res.redirect(`${redirectURL}?message=Successfully logged out from SSO-Server`);
});

module.exports = router;
