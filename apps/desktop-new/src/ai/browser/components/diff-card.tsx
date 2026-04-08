import React, { useState, useCallback } from 'react';
import * as fs from 'fs';
import styles from './diff-card.module.less';

export interface DiffPayload {
  filePath: string;
  relativePath: string;
  originalContent: string;
  newContent: string;
  additions: number;
  deletions: number;
  unifiedDiff: string;
}

interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'hunk';
  content: string;
  lineNum?: number;
}

/** Parse unified diff string into an array of renderable diff lines */
function parseDiffLines(unifiedDiff: string): DiffLine[] {
  const lines = unifiedDiff.split('\n');
  const result: DiffLine[] = [];
  let addNum = 0;
  let removeNum = 0;

  for (const line of lines) {
    if (line.startsWith('---') || line.startsWith('+++')) continue;
    if (line.startsWith('@@')) {
      // Parse hunk header: @@ -a,b +c,d @@
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        removeNum = parseInt(match[1], 10) - 1;
        addNum = parseInt(match[2], 10) - 1;
      }
      result.push({ type: 'hunk', content: line });
      continue;
    }

    if (line.startsWith('+')) {
      addNum++;
      result.push({ type: 'add', content: line.slice(1), lineNum: addNum });
    } else if (line.startsWith('-')) {
      removeNum++;
      result.push({ type: 'remove', content: line.slice(1), lineNum: removeNum });
    } else {
      addNum++;
      removeNum++;
      result.push({ type: 'context', content: line.startsWith(' ') ? line.slice(1) : line, lineNum: addNum });
    }
  }

  return result;
}

interface DiffCardProps {
  payload: DiffPayload;
}

const DiffCard: React.FC<DiffCardProps> = ({ payload }) => {
  const [status, setStatus] = useState<'pending' | 'accepted' | 'rejected'>('pending');
  const [collapsed, setCollapsed] = useState(false);

  const handleAccept = useCallback(() => {
    // File is already written — just mark as accepted
    setStatus('accepted');
  }, []);

  const handleReject = useCallback(() => {
    // Revert the file to original content
    try {
      fs.writeFileSync(payload.filePath, payload.originalContent, 'utf-8');
      setStatus('rejected');
    } catch (err: any) {
      console.error('[DiffCard] Failed to revert file:', err.message);
    }
  }, [payload.filePath, payload.originalContent]);

  const diffLines = parseDiffLines(payload.unifiedDiff);

  return (
    <div className={styles.diffCard}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.filename}>{payload.relativePath || payload.filePath}</span>
        {payload.additions > 0 && (
          <span className={`${styles.badge} ${styles.addBadge}`}>+{payload.additions}</span>
        )}
        {payload.deletions > 0 && (
          <span className={`${styles.badge} ${styles.removeBadge}`}>-{payload.deletions}</span>
        )}
        <button
          className={styles.expandToggle}
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand diff' : 'Collapse diff'}
        >
          {collapsed ? '▶ Show' : '▼ Hide'}
        </button>
      </div>

      {/* Diff body */}
      {!collapsed && (
        <div className={styles.diffBody}>
          {diffLines.map((line, idx) => {
            if (line.type === 'hunk') {
              return (
                <div key={idx} className={styles.hunkHeader}>
                  {line.content}
                </div>
              );
            }
            const lineClass =
              line.type === 'add'
                ? styles.diffLineAdd
                : line.type === 'remove'
                  ? styles.diffLineRemove
                  : styles.diffLineContext;

            const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';

            return (
              <div key={idx} className={`${styles.diffLine} ${lineClass}`}>
                <span className={styles.lineNum}>{line.lineNum ?? ''}</span>
                <span className={styles.linePrefix}>{prefix}</span>
                <span className={styles.lineContent}>{line.content}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className={styles.footer}>
        {status === 'pending' && (
          <>
            <button className={styles.acceptBtn} onClick={handleAccept}>
              ✅ Accept
            </button>
            <button className={styles.rejectBtn} onClick={handleReject}>
              ❌ Reject
            </button>
          </>
        )}
        {status === 'accepted' && (
          <span className={styles.applied}>✅ Changes applied to {payload.relativePath}</span>
        )}
        {status === 'rejected' && (
          <span className={styles.reverted}>↩ Reverted {payload.relativePath}</span>
        )}
      </div>
    </div>
  );
};

export default DiffCard;
