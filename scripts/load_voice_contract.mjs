import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';

export async function loadVoiceContract(projectRoot) {
  const source = await readFile(resolve(projectRoot, 'src/voice-script.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
    fileName: 'voice-script.ts',
    reportDiagnostics: true,
  });
  const errors = (compiled.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length) {
    const message = errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')).join('\n');
    throw new Error(`voice contract cannot be loaded:\n${message}`);
  }
  const dataUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`;
  return import(dataUrl);
}
