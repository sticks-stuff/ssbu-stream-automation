# ssbu-stream-automation

Uses my fork of [smush_info](https://github.com/sticks-stuff/smush_info) to automate various stream things. Used in WellySmash streams

- Changes OBS scenes based on the game
- Hide TSH overlay when the number of human players is not 2
- Loads set in TSH based on in-game tags
- Auto flips the player positions in TSH to align them with the game
- Changes player colour of TSH overlay based on port
- Automatically updates the score in TSH on game end
- Dumps timestamps of sets to file
- Changes scene on inactivity (no stage selected after results screen for >2 mins) and changes back upon selecting a stage. Used at locals to show the bracket
- [Updates character data and costume live on the character select screen](https://twitter.com/stick_twt/status/1734134432091844786)
- [Creates a dynamic mask for Hero's menu (see hero_menu.html) for use on bottom aligned overlays](https://twitter.com/stick_twt/status/1735232265763143938)
- Login with Twitch and automatically change the !bracket command and make predictions
- Output a Streameta compatible JSON that works with the Streameta [browser extension](https://streameta.com/extension/)
- Sets "best of" in TSH based on the state of the bracket (i.e top 8 Bo5 else Bo3)
- (Expiremental) [Creates a mask around players to hide overlay stuff](https://x.com/stick_twt/status/1749442446528827669)
- (Expiremental) [Adds masks for player portrait and stocks and revival animation](https://x.com/stick_twt/status/1826882927000780836) 

Consider giving me some form of credit if you use this in a stream :) ([@stick_twt](https://twitter.com/stick_twt) on Twitter, or just sharlot)
