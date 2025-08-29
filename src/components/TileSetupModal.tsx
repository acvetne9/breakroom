import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { CheckCircle, Terminal, Copy } from 'lucide-react';
import { useToast } from './ui/use-toast';

interface TileSetupModalProps {
  open: boolean;
  onClose: () => void;
  missingBusinessTiles: boolean;
  missingLandTiles: boolean;
}

export const TileSetupModal: React.FC<TileSetupModalProps> = ({
  open,
  onClose,
  missingBusinessTiles,
  missingLandTiles
}) => {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const maxSteps = 4;

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied to clipboard",
        description: "Command copied successfully"
      });
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  const commands = {
    install: {
      macos: "brew install tippecanoe",
      ubuntu: "sudo apt install tippecanoe"
    },
    mkdir: "mkdir -p public/tiles",
    businesses: `tippecanoe -o public/tiles/businesses.mbtiles public/data/example-points.geojson \\
  --minimum-zoom=10 \\
  --maximum-zoom=16 \\
  --drop-densest-as-needed \\
  --simplify-only-low-zooms \\
  --layer=businesses`,
    land: `tippecanoe -o public/tiles/land.mbtiles public/data/nyc_land.geojson \\
  --minimum-zoom=8 \\
  --maximum-zoom=16 \\
  --layer=land`,
    extract: `tile-join -e public/tiles/businesses public/tiles/businesses.mbtiles && \\
tile-join -e public/tiles/land public/tiles/land.mbtiles`
  };

  const CommandBlock = ({ title, command, description }: { title: string; command: string; description?: string }) => (
    <div className="space-y-2">
      <h4 className="font-medium flex items-center gap-2">
        <Terminal className="w-4 h-4" />
        {title}
      </h4>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      <div className="relative">
        <pre className="bg-muted p-3 rounded-lg text-sm overflow-x-auto">
          <code>{command}</code>
        </pre>
        <Button
          size="sm"
          variant="ghost"
          className="absolute top-2 right-2"
          onClick={() => copyToClipboard(command)}
        >
          <Copy className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="w-5 h-5" />
            Vector Tiles Setup Required
          </DialogTitle>
        </DialogHeader>

        <Alert>
          <AlertDescription>
            Vector tiles will reduce memory usage by 90%+ and dramatically improve performance. 
            You need to generate them once using the commands below.
          </AlertDescription>
        </Alert>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex space-x-2">
              {Array.from({ length: maxSteps }, (_, i) => (
                <div
                  key={i}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                    i + 1 <= step
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {i + 1 <= step ? <CheckCircle className="w-4 h-4" /> : i + 1}
                </div>
              ))}
            </div>
            <div className="text-sm text-muted-foreground">
              Step {step} of {maxSteps}
            </div>
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Step 1: Install tippecanoe</h3>
              <div className="space-y-4">
                <CommandBlock
                  title="macOS (with Homebrew)"
                  command={commands.install.macos}
                  description="If you don't have Homebrew, install it from brew.sh first"
                />
                <CommandBlock
                  title="Ubuntu/Debian"
                  command={commands.install.ubuntu}
                />
                <p className="text-sm text-muted-foreground">
                  For other systems, see: <a href="https://github.com/felt/tippecanoe" className="text-primary underline">tippecanoe installation guide</a>
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Step 2: Create tiles directory</h3>
              <CommandBlock
                title="Create directory"
                command={commands.mkdir}
                description="This creates the public/tiles directory structure"
              />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Step 3: Generate vector tiles</h3>
              <div className="space-y-4">
                {missingBusinessTiles && (
                  <CommandBlock
                    title="Generate business tiles"
                    command={commands.businesses}
                    description="Converts business GeoJSON data to vector tiles"
                  />
                )}
                {missingLandTiles && (
                  <CommandBlock
                    title="Generate land tiles"
                    command={commands.land}
                    description="Converts NYC land GeoJSON data to vector tiles"
                  />
                )}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Step 4: Extract tiles for serving</h3>
              <CommandBlock
                title="Extract tile files"
                command={commands.extract}
                description="Converts .mbtiles to individual .pbf files for web serving"
              />
              <Alert>
                <CheckCircle className="w-4 h-4" />
                <AlertDescription>
                  After running these commands, refresh the page. The app will automatically detect and use the vector tiles!
                </AlertDescription>
              </Alert>
            </div>
          )}

          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => setStep(Math.max(1, step - 1))}
              disabled={step === 1}
            >
              Previous
            </Button>
            <div className="flex gap-2">
              {step < maxSteps ? (
                <Button onClick={() => setStep(Math.min(maxSteps, step + 1))}>
                  Next
                </Button>
              ) : (
                <Button onClick={onClose}>
                  Done - Refresh Page
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};