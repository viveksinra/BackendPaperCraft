// middleware/roleMiddleware.js

const checkRole = (allowedRoles) => {
    return (req, res, next) => {
      const user = req.user;
  
      if (!user) {
        return res.json({ message: 'You are Unauthorized', variant: 'error' });
      }

      const FixRoles = ['Admin', 'Manager', 'Employee'];

      // check if all allowedRoles array should be from fixRoles array
        const isAllowed = allowedRoles.every(role => FixRoles.includes(role));
        if (!isAllowed) {
          return res.json({ message: 'Invalid role', variant: 'error' });
        }
  let designation = user.designation;
  if (!designation) {
    designation = 'User';
    }
      if (allowedRoles.includes(designation)) {
        return next();
      } else {
        return res.json({ message: 'Forbidden', variant: 'error' });
      }
    };
  };
  
  module.exports = checkRole;
  