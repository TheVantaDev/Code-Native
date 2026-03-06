import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

const shellIntegrationDirPath = path.join(os.homedir(), process.env.IDE_DATA_FOLDER_NAME!, 'shell-integration');

export const bashIntegrationPath = path.join(shellIntegrationDirPath, 'bash-integration.bash');

/**
  Injected bash initfile, used for ShellIntegration functionality construction.
  Future overall architectural design for ShellIntegration will be addressed; currently meets basic functional requirements.
 */
export const bashIntegrationContent = String.raw`

if [ -r /etc/profile ]; then
    . /etc/profile
fi
if [ -r ~/.bashrc ]; then
    . ~/.bashrc
fi
if [ -r ~/.bash_profile ]; then
    . ~/.bash_profile
elif [ -r ~/.bash_login ]; then
    . ~/.bash_login
elif [ -r ~/.profile ]; then
    . ~/.profile
fi

__is_prompt_start() {
	builtin printf '\e]6973;PS\a'
}

__is_prompt_end() {
	builtin printf '\e]6973;PE\a'
}

__is_update_prompt() {
	if [[ "$__is_custom_PS1" == "" || "$__is_custom_PS1" != "$PS1" ]]; then
        __is_original_PS1=$PS1
        __is_custom_PS1="\[$(__is_prompt_start)\]$__is_original_PS1\[$(__is_prompt_end)\]"
        export PS1="$__is_custom_PS1"
    fi
}

__is_update_prompt
`;

export const initShellIntegrationFile = async () => {
    await fs.mkdir(shellIntegrationDirPath, { recursive: true });
    await fs.writeFile(bashIntegrationPath, bashIntegrationContent);
};
