/**
 * @fileoverview Rule to flag non-camelcased identifiers
 * @author Nicholas C. Zakas
 */

"use strict";

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

module.exports = {
    meta: {
        docs: {
            description: "enforce camelcase naming convention",
            category: "Stylistic Issues",
            recommended: false,
            url: "https://eslint.org/docs/rules/camelcase"
        },

        schema: [
            {
                type: "object",
                properties: {
                    ignoreDestructuring: {
                        type: "boolean"
                    },
                    properties: {
                        enum: ["always", "never"]
                    },
                    propertiesStyle: {
                        enum: ["all", "lower", "upper"]
                    }
                },
                additionalProperties: false
            }
        ],

        messages: {
            notCamelCase: "Identifier '{{name}}' is not in camel case."
        }
    },

    create(context) {

        //--------------------------------------------------------------------------
        // Options
        //--------------------------------------------------------------------------
        const options = context.options[0] || {};
        let properties = options.properties || "";
        const propertiesStyle = options.propertiesStyle || "all";
        const ignoreDestructuring = options.ignoreDestructuring || false;

        if (properties !== "always" && properties !== "never") {
            properties = "always";
        }

        //--------------------------------------------------------------------------
        // Helpers
        //--------------------------------------------------------------------------

        // contains reported nodes to avoid reporting twice on destructuring with shorthand notation
        const reported = [];
        const ALLOWED_PARENT_TYPES = new Set(["CallExpression", "NewExpression"]);

        /**
         * Checks if a string is camelcase or all upper-case
         * @param {string} name The string to check.
         * @returns {boolean} if the string is underscored
         * @private
         */
        function isCamelcase(name) {
            return name === name.toUpperCase() || name.indexOf("_") === -1;
        }

        /**
         * Checks if a string is upper camelcase or all upper-case
         * @param {string} name The string to check.
         * @returns {boolean} if the string is upper camel-case
         * @private
         */
        function isUpperCamelcase(name) {
            return name === name.toUpperCase() || name.match(/^[A-Z$][a-zA-Z0-9$]*/);
        }

        /**
         * Checks if a string is lower camelcase or all upper-case
         * @param {string} name The string to check.
         * @returns {boolean} if the string is lower camel-case
         * @private
         */
        function isLowerCamelcase(name) {
            return name === name.toUpperCase() || name.match(/^[a-z$][a-zA-Z0-9$]*/);
        }

        /**
         * Checks if a string is a valid property name
         * @param {string} name The string to check.
         * @returns {boolean} if the string is valid
         * @private
         */
        function isValidPropertyName(name) {
            if (propertiesStyle === "upper") {
                return isUpperCamelcase(name);
            }
            if (propertiesStyle === "lower") {
                return isLowerCamelcase(name);
            }
            return isCamelcase(name);
        }

        /**
         * Checks if a parent of a node is an ObjectPattern.
         * @param {ASTNode} node The node to check.
         * @returns {boolean} if the node is inside an ObjectPattern
         * @private
         */
        function isInsideObjectPattern(node) {
            let { parent } = node;

            while (parent) {
                if (parent.type === "ObjectPattern") {
                    return true;
                }

                parent = parent.parent;
            }

            return false;
        }

        /**
         * Reports an AST node as a rule violation.
         * @param {ASTNode} node The node to report.
         * @returns {void}
         * @private
         */
        function report(node) {
            if (reported.indexOf(node) < 0) {
                reported.push(node);
                context.report({ node, messageId: "notCamelCase", data: { name: node.name } });
            }
        }

        return {

            Identifier(node) {

                /*
                 * Leading and trailing underscores are commonly used to flag
                 * private/protected identifiers, strip them
                 */
                const name = node.name.replace(/^_+|_+$/g, ""),
                    effectiveParent = (node.parent.type === "MemberExpression") ? node.parent.parent : node.parent;
                const isProperty = effectiveParent.type === "AssignmentExpression" &&
                    effectiveParent.left.type === "MemberExpression" &&
                    effectiveParent.left.property.name === node.name;

                // MemberExpressions get special rules
                if (node.parent.type === "MemberExpression") {

                    // "never" check properties
                    if (properties === "never") {
                        return;
                    }

                    // Always report underscored object names
                    if (node.parent.object.type === "Identifier" && node.parent.object.name === node.name && !isCamelcase(name)) {
                        report(node);

                    // Report AssignmentExpressions left side's last id
                    } else if (isProperty && !isValidPropertyName(name)) {
                        report(node);

                    // Report AssignmentExpressions only if they are the left side of the assignment
                    } else if (effectiveParent.type === "AssignmentExpression" &&
                        effectiveParent.right.type !== "MemberExpression" &&
                        !isCamelcase(name)
                    ) {
                        report(node);
                    }

                /*
                 * Properties have their own rules, and
                 * AssignmentPattern nodes can be treated like Properties:
                 * e.g.: const { no_camelcased = false } = bar;
                 */
                } else if (node.parent.type === "Property" || node.parent.type === "AssignmentPattern") {

                    if (node.parent.parent && node.parent.parent.type === "ObjectPattern") {
                        if (node.parent.shorthand && node.parent.value.left && !isCamelcase(name)) {

                            report(node);
                        }

                        const assignmentKeyEqualsValue = node.parent.key.name === node.parent.value.name;

                        // prevent checking righthand side of destructured object
                        if (!assignmentKeyEqualsValue && node.parent.key === node) {
                            return;
                        }

                        const valueIsUnderscored = node.parent.value.name && !isCamelcase(name);

                        // ignore destructuring if the option is set, unless a new identifier is created
                        if (valueIsUnderscored && !(assignmentKeyEqualsValue && ignoreDestructuring)) {
                            report(node);
                        }
                    }

                    // "never" check properties or always ignore destructuring
                    if (properties === "never" || (ignoreDestructuring && isInsideObjectPattern(node))) {
                        return;
                    }

                    // don't check right hand side of AssignmentExpression to prevent duplicate warnings
                    if (!ALLOWED_PARENT_TYPES.has(effectiveParent.type) &&
                        !(node.parent.right === node) &&
                        (isProperty ? !isValidPropertyName(name) : !isCamelcase(name))
                    ) {
                        report(node);
                    }

                // Check if it's an import specifier
                } else if (["ImportSpecifier", "ImportNamespaceSpecifier", "ImportDefaultSpecifier"].indexOf(node.parent.type) >= 0) {

                    // Report only if the local imported identifier is underscored
                    if (node.parent.local && node.parent.local.name === node.name && !isCamelcase(name)) {
                        report(node);
                    }

                // Report anything that is underscored that isn't a CallExpression
                } else if (!isCamelcase(name) && !ALLOWED_PARENT_TYPES.has(effectiveParent.type)) {
                    report(node);
                }
            }

        };

    }
};
