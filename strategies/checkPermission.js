const mongoose = require('mongoose');
const Role = require('../Models/Role');

function checkPermission(moduleKeys, actionKey) {
    return async (req, res, next) => {
        try {
            // Debug the user object structure
          
            
            // Get role ID - convert to plain object if needed
            const roleId = req.user.role || (req.user._doc && req.user._doc.role);
            
            if (!roleId) {
                return res.status(403).json({ 
                    message: "Access denied: No role assigned", 
                    variant: "error" 
                });
            }
            
            const userRole = await Role.findById(roleId).exec();
            
            if (!userRole) {
                return res.status(403).json({ 
                    message: "Access denied: Role not found", 
                    variant: "error" 
                });
            }

            // Helper function to traverse nested permissions
            const findNestedPermission = (permissions, keys) => {
                let current = permissions;
                
                // Traverse through the permission hierarchy
                for (const key of keys) {
                    const found = current.find(p => p.key === key);
                    if (!found || !found.enable) return null;
                    current = found.actions || [];
                }
                return current;
            };

            // Split the module path into individual keys
            let moduleKeyArray = Array.isArray(moduleKeys) ? moduleKeys : moduleKeys.split('.');
            // Allow dynamic entity injection: use req.params.entity when placeholder is present
            if (moduleKeyArray.includes(':entity')) {
                const entityKey = req.params && req.params.entity;
                moduleKeyArray = moduleKeyArray.map(k => (k === ':entity' ? entityKey : k));
            }
            
            // Find the deepest level permissions
            const modulePermission = findNestedPermission(userRole.permissions, moduleKeyArray);
            
            if (!modulePermission) {
                return res.json({ 
                    message: "Access denied: Module permission not enabled", 
                    variant: "error",
                    userRole: userRole
                });
            }

            // Rest of the code remains the same
            const actionMappings = {
                add: ["add"],
                list: ["viewAllList", "viewOwnList"],
                getOne: ["viewAllDetails", "viewOwnDetails"],
                edit: ["editAll", "editOwn"],
                delete: ["deleteAll", "deleteOwn"],
                exportData: ["exportData"]
            };

            const requiredActions = actionMappings[actionKey];

            if (!requiredActions) {
                return res.status(400).json({
                    message: "Invalid action key provided",
                    variant: "error"
                });
            }

            const permissions = requiredActions.map(key => 
                modulePermission.find(a => a.key === key)
            );

            if (permissions.every(p => !p || !p.enable)) {
                return res.status(403).json({
                    message: "Access denied: Action permission not enabled",
                    variant: "error"
                });
            }

            if (actionKey === "list" || actionKey === "getOne" || actionKey === "edit" || actionKey === "delete") {
                // Detect additional flags like viewSensitive at the module level
                const viewSensitive = !!modulePermission.find(a => a.key === 'viewSensitive' && a.enable);
                req.permissionData = {
                    full: permissions[0]?.enable || false,
                    own: permissions[1]?.enable || false,
                    sensitive: viewSensitive
                };
            }

            next();
        } catch (error) {
            console.error("Permission check failed:", error);
            return res.status(500).json({ 
                message: "Internal Server Error", 
                variant: "error" 
            });
        }
    };
}

module.exports = checkPermission;
