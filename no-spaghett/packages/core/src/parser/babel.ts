import { parse as babelParse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import { Parser } from './index.js';
import { Import, Export, FileNode } from '../types.js';
import * as path from 'path';

// Handle commonjs default export wrapping for @babel/traverse
const traverse = (traverseModule as any).default || traverseModule;

export class BabelParser implements Parser {
  language = 'javascript/typescript';

  canParse(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext);
  }

  parse(filePath: string, content: string): Omit<FileNode, 'id' | 'lines' | 'size'> {
    const ext = path.extname(filePath).toLowerCase();
    const isTS = ['.ts', '.tsx'].includes(ext);
    const isJSX = ['.jsx', '.tsx', '.js'].includes(ext);

    const imports: Import[] = [];
    const exports: Export[] = [];

    try {
      const ast = babelParse(content, {
        sourceType: 'module',
        allowImportExportEverywhere: true,
        plugins: [
          isTS ? 'typescript' : 'flow',
          isJSX ? 'jsx' : null,
          'decorators-legacy',
          'classProperties',
          'objectRestSpread',
          'dynamicImport'
        ].filter(Boolean) as any
      });

      traverse(ast, {
        // ESM static imports
        ImportDeclaration(nodePath: any) {
          const node = nodePath.node;
          const source = node.source.value;
          const specifiers: string[] = [];
          let type: Import['type'] = 'named';

          node.specifiers.forEach((spec: any) => {
            if (spec.type === 'ImportDefaultSpecifier') {
              type = 'default';
              specifiers.push(spec.local.name);
            } else if (spec.type === 'ImportNamespaceSpecifier') {
              type = 'namespace';
              specifiers.push(spec.local.name);
            } else if (spec.type === 'ImportSpecifier') {
              specifiers.push((spec.imported?.name || spec.local.name));
            }
          });

          imports.push({
            source,
            type,
            specifiers,
            isRelative: source.startsWith('.') || source.startsWith('/')
          });
        },

        // ESM re-exports (export * from 'x')
        ExportAllDeclaration(nodePath: any) {
          const node = nodePath.node;
          const source = node.source.value;
          exports.push({
            name: '*',
            type: 'reExport',
            source
          });
          // Also acts as an import dependency
          imports.push({
            source,
            type: 'namespace',
            specifiers: ['*'],
            isRelative: source.startsWith('.') || source.startsWith('/')
          });
        },

        // ESM exports
        ExportNamedDeclaration(nodePath: any) {
          const node = nodePath.node;
          const source = node.source ? node.source.value : undefined;
          
          if (node.declaration) {
            const decl = node.declaration;
            if (decl.id) {
              exports.push({
                name: decl.id.name,
                type: 'named'
              });
            } else if (decl.declarations) {
              decl.declarations.forEach((d: any) => {
                if (d.id && d.id.name) {
                  exports.push({
                    name: d.id.name,
                    type: 'named'
                  });
                }
              });
            }
          }

          if (node.specifiers) {
            node.specifiers.forEach((spec: any) => {
              const exportedName = spec.exported?.name || spec.local?.name || 'unknown';
              exports.push({
                name: exportedName,
                type: source ? 'reExport' : 'named',
                source,
                localName: spec.local?.name
              });
              if (source) {
                imports.push({
                  source,
                  type: 'named',
                  specifiers: [spec.local?.name || 'default'],
                  isRelative: source.startsWith('.') || source.startsWith('/')
                });
              }
            });
          }
        },

        ExportDefaultDeclaration(nodePath: any) {
          const node = nodePath.node;
          let name = 'default';
          if (node.declaration && node.declaration.id) {
            name = node.declaration.id.name;
          }
          exports.push({
            name,
            type: 'default'
          });
        },

        // Dynamic imports & CommonJS require
        CallExpression(nodePath: any) {
          const node = nodePath.node;
          
          // Dynamic import()
          if (node.callee.type === 'Import') {
            if (node.arguments[0] && node.arguments[0].type === 'StringLiteral') {
              const source = node.arguments[0].value;
              imports.push({
                source,
                type: 'dynamic',
                specifiers: [],
                isRelative: source.startsWith('.') || source.startsWith('/')
              });
            }
          }

          // CommonJS require
          if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
            if (node.arguments[0] && node.arguments[0].type === 'StringLiteral') {
              const source = node.arguments[0].value;
              imports.push({
                source,
                type: 'commonjs',
                specifiers: [],
                isRelative: source.startsWith('.') || source.startsWith('/')
              });
            }
          }
        }
      });
    } catch (e: any) {
      console.warn(`[PARSER] Failed parsing AST for ${filePath}: ${e.message}`);
    }

    const language = isTS ? (isJSX ? 'tsx' : 'ts') : (isJSX ? 'jsx' : 'js');

    return {
      path: filePath,
      imports,
      exports,
      language
    };
  }
}
