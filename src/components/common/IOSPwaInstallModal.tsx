import React from 'react';
import { PWAInstallModal } from './PWAInstallModal';

interface IOSPwaInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IOSPwaInstallModal: React.FC<IOSPwaInstallModalProps> = ({ isOpen, onClose }) => {
  return <PWAInstallModal isOpen={isOpen} onClose={onClose} initialPlatform="ios" />;
};
