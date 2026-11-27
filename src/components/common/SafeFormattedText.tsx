import React from 'react';
import {
  parseSafeFormattedBlocks,
  type SafeFormattedInline,
} from '../../utils/uiCopyUtils';

interface SafeFormattedTextProps {
  content: string | null | undefined;
  className?: string;
}

function renderInlines(inlines: SafeFormattedInline[]): React.ReactNode {
  return inlines.map((part, idx) => {
    if (part.type === 'br') {
      return <br key={idx} />;
    }
    if (part.type === 'strong') {
      return (
        <strong key={idx} className="font-semibold text-white">
          {part.text}
        </strong>
      );
    }
    if (part.type === 'em') {
      return (
        <em key={idx} className="italic">
          {part.text}
        </em>
      );
    }
    return <React.Fragment key={idx}>{part.text}</React.Fragment>;
  });
}

export const SafeFormattedText: React.FC<SafeFormattedTextProps> = ({
  content,
  className = '',
}) => {
  const blocks = parseSafeFormattedBlocks(content);
  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      {blocks.map((block, idx) => {
        if (block.type === 'heading') {
          return (
            <h3 key={idx} className="text-sm font-bold text-white mt-2 first:mt-0">
              {renderInlines(block.inlines)}
            </h3>
          );
        }
        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul';
          const listClass = block.ordered
            ? 'list-decimal pl-5 space-y-1'
            : 'list-disc pl-5 space-y-1';
          return (
            <ListTag key={idx} className={listClass}>
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx}>{renderInlines(item)}</li>
              ))}
            </ListTag>
          );
        }
        return <p key={idx}>{renderInlines(block.inlines)}</p>;
      })}
    </div>
  );
};
