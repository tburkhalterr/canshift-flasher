// src/components/Flasher.tsx
import { useMemo, type ReactElement } from 'react'

import { useFlasher } from '../hooks/useFlasher'
import { useReleaseChannel, type UseReleaseChannelResult } from '../hooks/useReleaseChannel'
import { readDefaultChannel } from '../lib/releases'
import { isSimEnabled } from '../lib/sim'

import { FailedView } from './flasher/FailedView'
import { FlashingView } from './flasher/FlashingView'
import { IdleView } from './flasher/IdleView'
import { ReadyView } from './flasher/ReadyView'
import { SimBadge } from './flasher/SimBadge'
import { SuccessView } from './flasher/SuccessView'
import { UnsupportedBrowser } from './flasher/UnsupportedBrowser'
import { StepGuide } from './StepGuide'

interface FlasherProps {
  webSerialSupported: boolean
}

const renderStateView = (
  flasher: ReturnType<typeof useFlasher>,
  channelState: UseReleaseChannelResult,
): ReactElement => {
  switch (flasher.state) {
    case 'idle':
      return (
        <IdleView
          onConnect={flasher.selectPort}
          errorMessage={flasher.errorMessage}
          release={flasher.release}
          advanced={flasher.advanced}
          onAdvancedChange={flasher.setAdvanced}
          localFirmware={flasher.localFirmware}
          onLocalFirmwareChange={flasher.setLocalFirmware}
          channelState={channelState}
          ecuProfile={flasher.ecuProfile}
          onEcuProfileChange={flasher.setEcuProfile}
          dashboardLayout={flasher.dashboardLayout}
          onDashboardLayoutChange={flasher.setDashboardLayout}
        />
      )
    case 'ready':
      return (
        <ReadyView
          port={flasher.port}
          chipInfo={flasher.chipInfo}
          onFlash={flasher.flash}
          onReselect={flasher.reselectPort}
          advanced={flasher.advanced}
          onAdvancedChange={flasher.setAdvanced}
          localFirmware={flasher.localFirmware}
          onLocalFirmwareChange={flasher.setLocalFirmware}
          channelState={channelState}
        />
      )
    case 'flashing':
      return (
        <FlashingView
          downloadProgress={flasher.downloadProgress}
          spiffsDownloadProgress={flasher.spiffsDownloadProgress}
          flashProgress={flasher.flashProgress}
          chipInfo={flasher.chipInfo}
          log={flasher.log}
          onCancel={flasher.cancel}
        />
      )
    case 'success':
      return (
        <SuccessView
          onAgain={flasher.reset}
          log={flasher.log}
          chipInfo={flasher.chipInfo}
          port={flasher.port}
          release={flasher.release}
          logTruncated={flasher.logTruncated}
          ecuProfile={flasher.ecuProfile}
          dashboardLayout={flasher.dashboardLayout}
        />
      )
    case 'failed':
      return (
        <FailedView
          errorMessage={flasher.errorMessage}
          errorClass={flasher.errorClass}
          onRetry={flasher.flash}
          onReset={flasher.reset}
          onReselectPort={flasher.reselectPort}
          log={flasher.log}
          chipInfo={flasher.chipInfo}
          port={flasher.port}
          release={flasher.release}
          logTruncated={flasher.logTruncated}
        />
      )
  }
}

export const Flasher = ({ webSerialSupported }: FlasherProps): ReactElement => {
  const flasher = useFlasher()
  const initialChannel = useMemo(() => readDefaultChannel(), [])
  const channelState = useReleaseChannel(initialChannel)

  if (!webSerialSupported) {
    return <UnsupportedBrowser />
  }

  return (
    <div className="space-y-6">
      {isSimEnabled() ? <SimBadge /> : null}
      <div className="md:grid md:grid-cols-[160px_1fr] md:gap-6 space-y-6 md:space-y-0">
        <StepGuide state={flasher.state} />
        <div className="md:border-l md:border-border md:pl-6">
          {renderStateView(flasher, channelState)}
        </div>
      </div>
    </div>
  )
}
