const JwtStrategy = require("passport-jwt").Strategy;
const ExtractJwt = require("passport-jwt").ExtractJwt;
const mongoose = require("mongoose");
const User = mongoose.model("users");
require("dotenv/config");

const opts = {};
opts.jwtFromRequest = ExtractJwt.fromAuthHeaderAsBearerToken();
opts.secretOrKey = process.env.JWT_SECRET;

module.exports = (passport) => {
  passport.use(
    new JwtStrategy(opts, async (jwt_payload, done) => {
      try {
        
        // Check if it's a professional user
        if (jwt_payload.userType === 'professional') {
          const Professional = mongoose.model("professionals");
          const professional = await Professional.findById(jwt_payload.id);
          if (professional) {
            return done(null, professional);
          }
        } else if (jwt_payload.userType === 'team') {
          // Handle team member authentication
          const Team = mongoose.model("myTeam");
          const teamMember = await Team.findById(jwt_payload.id).populate('role').populate('vertical');
          if (teamMember) {
            return done(null, teamMember);
          }
        } else {
          // Default to regular user
          const user = await User.findById(jwt_payload.id);
          if (user) {
            return done(null, user);
          }
        }
        
        return done(null, false);
      } catch (error) {
        console.error("JWT Strategy error:", error);
        return done(error, false);
      }
    })
  );

  // Passport serialization for sessions (moved inside the function)
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser((id, done) => {
    User.findById(id)
      .then(user => {
        done(null, user);
      })
      .catch(err => {
        done(err, null);
      });
  });
};
