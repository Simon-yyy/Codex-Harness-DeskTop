import { useState, useEffect } from 'react';
import { UpdateInfo, UpdateProgress } from '@/types/electron';

export function useUpdater() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress>({ percent: 0, downloadedBytes: 0, totalBytes: 0 });
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [downloadedVersion, setDownloadedVersion] = useState('');

  useEffect(() => {
    if (!window.codexDesktop) return;

    if (window.codexDesktop.onUpdateAvailable) {
      window.codexDesktop.onUpdateAvailable((info) => {
        setUpdateInfo(info);
        setIsModalOpen(true);
      });
    }

    if (window.codexDesktop.onUpdateDownloading) {
      window.codexDesktop.onUpdateDownloading(() => {
        setIsDownloading(true);
      });
    }

    if (window.codexDesktop.onUpdateProgress) {
      window.codexDesktop.onUpdateProgress((prog) => {
        setProgress(prog);
      });
    }

    if (window.codexDesktop.onUpdateDownloaded) {
      window.codexDesktop.onUpdateDownloaded((res) => {
        setIsDownloaded(true);
        setDownloadedVersion(res.version);
        setIsDownloading(false);
      });
    }
  }, []);

  const startDownload = () => {
    if (updateInfo && window.codexDesktop && window.codexDesktop.startDownloadUpdate) {
      setIsDownloading(true);
      window.codexDesktop.startDownloadUpdate({
        downloadUrl: updateInfo.downloadUrl,
        version: updateInfo.latestVersion
      });
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const checkForUpdates = () => {
    if (window.codexDesktop && window.codexDesktop.checkForUpdates) {
      window.codexDesktop.checkForUpdates(false);
    }
  };

  return {
    updateInfo,
    isModalOpen,
    setIsModalOpen,
    isDownloading,
    progress,
    isDownloaded,
    downloadedVersion,
    startDownload,
    closeModal,
    checkForUpdates
  };
}
