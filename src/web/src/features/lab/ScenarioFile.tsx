import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';
import { buttonClassName } from '../../ui/button-styles';
import { Card } from '../../ui/Card';
import { TextArea } from '../../ui/TextField';
import { exportScenario, parseScenario } from './scenario';
import type { LabScenario } from './useLab';

type ScenarioFileProps = {
  scenario: LabScenario;
  onImport: (scenario: LabScenario) => void;
  onReset: () => void;
};

// Export the scenario as JSON, and import it back, from a file or pasted text (M1-06). Import also
// reads a bare generator input, which is what the property tests print for a failure (M1-03).
export function ScenarioFile({ scenario, onImport, onReset }: ScenarioFileProps) {
  const { t } = useTranslation();
  const fileId = useId();
  const [text, setText] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string }>();

  const load = (json: string) => {
    const result = parseScenario(json, t('lab.file.importedName'));
    if (result.ok) {
      onImport(result.scenario);
      setText('');
      setMessage({ tone: 'ok', text: t('lab.file.imported', { name: result.scenario.name }) });
    } else {
      setMessage({ tone: 'error', text: t(`lab.file.${result.error}`) });
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([exportScenario(scenario)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileNameOf(scenario.name)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold">{t('lab.file.title')}</h2>
        <p className="text-sm text-muted">{t('lab.file.hint')}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button variant="white" onClick={download}>
          {t('lab.file.export')}
        </Button>
        {/* A label styled as a button opens the file picker: taps only, no dragging (NFR-002). */}
        <label
          htmlFor={fileId}
          className={buttonClassName(
            'white',
            'cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-link',
          )}
        >
          {t('lab.file.chooseFile')}
          <input
            id={fileId}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void file.text().then(load);
            }}
          />
        </label>
        <Button variant="white" onClick={onReset}>
          {t('lab.file.reset')}
        </Button>
      </div>
      <TextArea
        label={t('lab.file.paste')}
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={4}
        spellCheck={false}
        className="font-mono"
      />
      <Button className="self-start" disabled={text.trim() === ''} onClick={() => load(text)}>
        {t('lab.file.import')}
      </Button>
      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={
            message.tone === 'error' ? 'text-sm font-bold text-danger' : 'text-sm font-bold text-success'
          }
        >
          {message.text}
        </p>
      )}
    </Card>
  );
}

// "Presotea Montmorency" -> "presotea-montmorency".
function fileNameOf(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'scenario'
  );
}
