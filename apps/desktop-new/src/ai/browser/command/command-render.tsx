import React, { useCallback, useEffect, useMemo } from 'react';

import { ChatThinking, ChatThinkingResult } from '@opensumi/ide-ai-native/lib/browser/components/ChatThinking';
import { ChatMarkdown } from '@opensumi/ide-ai-native/lib/browser/components/ChatMarkdown';
import { TSlashCommandCustomRender } from '@opensumi/ide-ai-native/lib/browser/types';
import { useInjectable, COMMON_COMMANDS, CommandService } from '@opensumi/ide-core-browser';
import { Button } from '@opensumi/ide-core-browser/lib/components';
import { CommandOpener } from '@opensumi/ide-core-browser/lib/opener/command-opener';
import { IAIBackServiceResponse, URI } from '@opensumi/ide-core-common';
import { AICommandService, ISumiModelResp, ISumiCommandModelResp, ISumiSettingModelResp } from './command.service';

import styles from './command-render.module.less';

const AiResponseTips = {
  ERROR_RESPONSE: 'I am interacting with too many people right now, please try again later. Thank you for your understanding and support.',
  STOP_IMMEDIATELY: 'I will stop thinking for now. Feel free to ask me anytime.',
  NOTFOUND_COMMAND: 'Sorry, no immediately executable command was found.',
  NOTFOUND_COMMAND_TIP: 'You can open the command palette to search for related actions or ask again.'
};

export const CommandRender: TSlashCommandCustomRender = ({ userMessage }) => {
  const aiSumiService = useInjectable<AICommandService>(AICommandService);
  const opener = useInjectable<CommandOpener>(CommandOpener);
  const commandService = useInjectable<CommandService>(CommandService);

  const [loading, setLoading] = React.useState(false);
  const [modelRes, setModelRes] = React.useState<IAIBackServiceResponse<ISumiModelResp>>();

  const userInput = useMemo(() => {
    return userMessage.replace('/IDE', '').trim();
  }, [userMessage]);

  useEffect(() => {
    if (!userInput) {
      return;
    }

    setLoading(true);

    aiSumiService.getModelResp(userInput)
      .then((resp) => {
        setModelRes(resp);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [userInput]);

  const excute = useCallback(() => {
    if (modelRes && modelRes.data) {
      if (type === 'command') {
        const modelData = data as ISumiCommandModelResp;
        opener.open(URI.parse(`command:${modelData.commandKey}`));
        return;
      }

      if (type === 'setting') {
        const modelData = data as ISumiSettingModelResp;

        commandService.executeCommand(COMMON_COMMANDS.OPEN_PREFERENCES.id, modelData.settingKey);
      }
    }
  }, [modelRes]);


  const failedText = useMemo(() => {
    if (!modelRes) {
      return '';
    }

    return modelRes.errorCode
      ? AiResponseTips.ERROR_RESPONSE
      : !modelRes.data
        ? AiResponseTips.NOTFOUND_COMMAND
        : '';
  }, [modelRes]);

  const handleRegenerate = useCallback(() => {
    console.log('retry');
  }, []);

  if (loading || !modelRes) {
    return <ChatThinking />;
  }

  if (failedText) {
    return (
      <ChatThinkingResult onRegenerate={handleRegenerate}>
        {failedText === AiResponseTips.NOTFOUND_COMMAND ? (
          <div>
            <p>{failedText}</p>
            <p>{AiResponseTips.NOTFOUND_COMMAND_TIP}</p>
            <Button
              style={{ width: '100%' }}
              onClick={() =>
                opener.open(
                  URI.from({
                    scheme: 'command',
                    path: 'editor.action.quickCommand.withCommand',
                    query: JSON.stringify([userInput]),
                  }),
                )
              }
            >
              Open Command Palette
            </Button>
          </div>
        ) : (
          failedText
        )}
      </ChatThinkingResult>
    );
  }

  const { data } = modelRes;
  const { type, answer } = data ?? {};

  return (
    <ChatThinkingResult onRegenerate={handleRegenerate}>
      <div className={styles.chat_excute_result}>
        <ChatMarkdown markdown={answer ?? ''} />
        {type !== 'null' && (
          <Button onClick={excute} style={{ marginTop: '12px' }}>
            {type === 'command' ? 'Click to execute' : 'Show in settings'}
          </Button>
        )}
      </div>
    </ChatThinkingResult>
  );
};