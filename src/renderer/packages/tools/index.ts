import { t } from 'i18next'

export function getToolName(toolName: string): string {
  // Use translation keys that i18next cli can detect
  const toolNames: Record<string, string> = {
    query_knowledge_base: t('Query Knowledge Base'),
    get_files_meta: t('Get Files Meta'),
    read_file_chunks: t('Read File Chunks'),
    list_files: t('List Files'),
    web_search: t('Web Search'),
    file_search: t('File Search'),
    code_search: t('Code Search'),
    terminal: t('Terminal'),
    create_file: t('Create File'),
    edit_file: t('Edit File'),
    delete_file: t('Delete File'),
    parse_link: t('Parse Link'),
    chess__start_game: t('Start Chess Game'),
    chess__make_move: t('Make Chess Move'),
    chess__get_hint: t('Chess Hint'),
    chess__get_board_state: t('Chess Board State'),
    flashcards__open_deck: t('Open Flashcards'),
    flashcards__flip_card: t('Flip Flashcard'),
    flashcards__next_card: t('Next Flashcard'),
    quiz__open_quiz: t('Open Quiz'),
    quiz__submit_answer: t('Submit Quiz Answer'),
    quiz__update_quiz_title: t('Update Quiz Title'),
  }

  return toolNames[toolName] || toolName
}
