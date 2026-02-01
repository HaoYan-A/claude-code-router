import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApiKeys } from '@/lib/queries';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ApiKeySelectorProps {
  onKeyChange: (key: string) => void;
}

export function ApiKeySelector({ onKeyChange }: ApiKeySelectorProps) {
  const { data, isLoading } = useApiKeys(1, 100);
  const [selectedKeyId, setSelectedKeyId] = useState<string>('');
  const [isLoadingKey, setIsLoadingKey] = useState(false);

  const apiKeys = data?.data.data ?? [];

  useEffect(() => {
    if (apiKeys.length > 0 && !selectedKeyId) {
      handleSelect(apiKeys[0].id);
    }
  }, [apiKeys]);

  const handleSelect = async (keyId: string) => {
    setSelectedKeyId(keyId);
    setIsLoadingKey(true);
    try {
      const response = await api.get<{ success: boolean; data: { key: string } }>(
        `/api-keys/${keyId}/key`
      );
      onKeyChange(response.data.key);
    } catch (error) {
      console.error('Failed to fetch API key:', error);
      onKeyChange('');
    } finally {
      setIsLoadingKey(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (!apiKeys.length) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center">
        <p className="text-muted-foreground mb-2">你还没有 API Key</p>
        <Button asChild>
          <Link to="/api-keys">创建 API Key</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">选择 API Key</label>
      <Select value={selectedKeyId} onValueChange={handleSelect} disabled={isLoadingKey}>
        <SelectTrigger>
          <SelectValue placeholder="选择一个 API Key" />
        </SelectTrigger>
        <SelectContent>
          {apiKeys.map((key) => (
            <SelectItem key={key.id} value={key.id}>
              {key.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
