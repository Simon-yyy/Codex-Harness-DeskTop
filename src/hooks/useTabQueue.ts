import { useState } from 'react';
import { QueuedInstruction, AttachedImage } from '@/types/session';

export function useTabQueue() {
  const [queue, setQueue] = useState<QueuedInstruction[]>([]);

  const enqueue = (prompt: string, images: AttachedImage[] = []) => {
    const item: QueuedInstruction = {
      id: 'queue_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      prompt,
      images,
      timestamp: Date.now()
    };
    setQueue(prev => [...prev, item]);
    return item;
  };

  const dequeue = () => {
    if (queue.length === 0) return null;
    const [first, ...rest] = queue;
    setQueue(rest);
    return first;
  };

  const removeQueueItem = (id: string) => {
    setQueue(prev => prev.filter(q => q.id !== id));
  };

  const clearQueue = () => {
    setQueue([]);
  };

  return {
    queue,
    enqueue,
    dequeue,
    removeQueueItem,
    clearQueue
  };
}
