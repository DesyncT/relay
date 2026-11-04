# Update splash: Relay quits for the silent install, so this small window runs on its own and
# closes when the new Relay window shows up (or after 3 minutes). Started by updater.js.
param([int]$OldPid = 0, [string]$Version = '', [string]$Shot = '')
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

$sub = if ($Version) { "Installing $Version &#183; Relay reopens when it's done" } else { "Relay reopens when it's done" }
$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
  Title="Updating Relay" Width="400" Height="236" WindowStyle="None" AllowsTransparency="True" Background="Transparent"
  ResizeMode="NoResize" WindowStartupLocation="CenterScreen" Topmost="True" ShowInTaskbar="True" FontFamily="Segoe UI">
  <Window.Triggers>
    <EventTrigger RoutedEvent="Window.Loaded">
      <BeginStoryboard><Storyboard RepeatBehavior="Forever" AutoReverse="True">
        <DoubleAnimation Storyboard.TargetName="Mark" Storyboard.TargetProperty="Opacity" From="1" To="0.6" Duration="0:0:0.7"/>
      </Storyboard></BeginStoryboard>
      <BeginStoryboard><Storyboard RepeatBehavior="Forever">
        <DoubleAnimation Storyboard.TargetName="Slide" Storyboard.TargetProperty="X" From="-96" To="336" Duration="0:0:1.4">
          <DoubleAnimation.EasingFunction><SineEase EasingMode="EaseInOut"/></DoubleAnimation.EasingFunction>
        </DoubleAnimation>
      </Storyboard></BeginStoryboard>
      <BeginStoryboard><Storyboard>
        <DoubleAnimation Storyboard.TargetName="Card" Storyboard.TargetProperty="Opacity" From="0" To="1" Duration="0:0:0.2"/>
      </Storyboard></BeginStoryboard>
    </EventTrigger>
  </Window.Triggers>
  <Border x:Name="Card" Background="#141415" BorderBrush="#2C2C2F" BorderThickness="1" CornerRadius="16" Padding="32,28">
    <StackPanel>
      <!-- assets/relay.svg: black tile, two white crossing lines -->
      <Viewbox x:Name="Mark" Width="48" Height="48" HorizontalAlignment="Left">
        <Canvas Width="512" Height="512">
          <Rectangle Canvas.Left="24" Canvas.Top="24" Width="464" Height="464" RadiusX="88" RadiusY="88" Fill="#000000"/>
          <Path Data="M112 172h68c68 0 84 168 152 168h68M352 296l48 44-48 44" Stroke="#FFFFFF" StrokeThickness="34" StrokeStartLineCap="Square" StrokeEndLineCap="Square" StrokeLineJoin="Miter"/>
          <Path Data="M112 340h68c68 0 84-168 152-168h68M352 128l48 44-48 44" Stroke="#FFFFFF" StrokeThickness="34" StrokeStartLineCap="Square" StrokeEndLineCap="Square" StrokeLineJoin="Miter"/>
        </Canvas>
      </Viewbox>
      <TextBlock Text="Updating Relay" Margin="0,20,0,0" FontSize="16" FontWeight="Medium" Foreground="#EDEDED"/>
      <TextBlock Text="$sub" Margin="0,4,0,0" FontSize="13" Foreground="#85858B" TextWrapping="Wrap"/>
      <Border Height="4" Margin="0,20,0,0" CornerRadius="2" Background="#232325" ClipToBounds="True">
        <Rectangle Width="96" Height="4" RadiusX="2" RadiusY="2" Fill="#E07A5F" HorizontalAlignment="Left">
          <Rectangle.RenderTransform><TranslateTransform x:Name="Slide" X="-96"/></Rectangle.RenderTransform>
        </Rectangle>
      </Border>
    </StackPanel>
  </Border>
</Window>
"@
$win = [Windows.Markup.XamlReader]::Parse($xaml)
$start = Get-Date
$timer = New-Object Windows.Threading.DispatcherTimer
$timer.Interval = [TimeSpan]::FromMilliseconds(500)
$timer.Add_Tick({
  if ($Shot) {
    if (((Get-Date) - $start).TotalSeconds -lt 1.2) { return }
    $bmp = New-Object Windows.Media.Imaging.RenderTargetBitmap 400, 236, 96, 96, ([Windows.Media.PixelFormats]::Pbgra32)
    $bmp.Render($win.Content)
    $enc = New-Object Windows.Media.Imaging.PngBitmapEncoder
    $enc.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($bmp))
    $fs = [IO.File]::Create($Shot); $enc.Save($fs); $fs.Close()
    $win.Close(); return
  }
  $old = if ($OldPid) { Get-Process -Id $OldPid -ErrorAction SilentlyContinue } else { $null }
  $new = Get-Process -Name Relay -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $OldPid -and $_.StartTime -gt $start -and $_.MainWindowHandle -ne 0 }
  if ((-not $old -and $new) -or ((Get-Date) - $start).TotalSeconds -gt 180) { $timer.Stop(); $win.Close() }
})
$timer.Start()
[void]$win.ShowDialog()
