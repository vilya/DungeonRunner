DROPBOX_DIR = /cygdrive/C/Users/vilya/Dropbox
DEPLOY_DIR = $(DROPBOX_DIR)/Public/DungeonRunner
SRC_DIR = .

LEVEL_SRCS = \
  levels/level1.tga \
  levels/level2.tga \
  levels/titles.tga


.PHONY: levels
levels: levels/levels.js


.PHONY: deploy
deploy: deploy_dir fix_perms
	cp -R $(SRC_DIR)/* $(DEPLOY_DIR)


.PHONY: deploy_dir
deploy_dir:
	mkdir -p $(DEPLOY_DIR)


.PHONY: fix_perms
fix_perms:
	chmod a-x .gitignore Makefile index.html README.md js/* fonts/* img/* levels/* sfx/* doc/* screenshots/*


levels/levels.js: tools/levelgen/levelgen $(LEVEL_SRCS)
	tools/levelgen/levelgen $@ $(LEVEL_SRCS)


tools/levelgen/levelgen:
	$(MAKE) -C tools/levelgen


clean:
	@echo rm -rf $(DEPLOY_DIR)

